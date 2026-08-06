"""城市探索服务：LLM 联网搜索 + 高德 POI 降级。

优先智谱 GLM 联网 + JSON 结构化输出；失败或无 Key 时用高德真实 POI 补全。
"""
from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Generator
from typing import TYPE_CHECKING, Any

import httpx

from app.services.amap_client import AmapError, POI_TYPES, Poi, get_amap_client
from app.services.chat_service import resolve_llm_config
from app.services.destination_landmarks import is_micro_poi, resolve_landmarks

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一个旅游信息助手。用户会给你一个城市名，你需要通过联网搜索获取该城市的真实信息。

请返回严格的 JSON 对象，格式如下：
{
  "foods": [
    {"name": "美食名称", "desc": "一句话描述特色"},
    ...3到4个当地特色美食
  ],
  "spots": [
    {"name": "景点名称", "desc": "一句话描述特色"},
    ...3到4个热门景点
  ]
}

要求：
- 必须基于联网搜索的真实信息，不要编造
- 如果搜索不到有效信息，对应数组返回空 []
- 每项 desc 不超过 50 字
- 只返回 JSON，不要任何其他文字"""


def _parse_json_content(content: str) -> dict[str, Any]:
    """解析 LLM 输出为 JSON，兼容 markdown 代码块包裹。"""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    result = json.loads(text)
    if not isinstance(result, dict):
        raise ValueError(f"LLM 输出非 JSON 对象: {type(result)}")
    return result


def _poi_desc(poi: Poi, fallback: str) -> str:
    parts: list[str] = []
    if poi.address:
        parts.append(poi.address[:36])
    if poi.rating:
        parts.append(f"评分 {poi.rating}")
    text = " · ".join(parts)
    return text[:50] if text else fallback


def _poi_to_item(poi: Poi, desc: str) -> dict[str, Any]:
    item: dict[str, Any] = {"name": poi.name, "desc": desc[:50]}
    item["lng"] = poi.lng
    item["lat"] = poi.lat
    if poi.address:
        item["address"] = poi.address
    return item


def _normalize_items(items: list[Any], *, fallback_desc: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        desc = str(item.get("desc", "")).strip() or fallback_desc
        row: dict[str, Any] = {"name": name, "desc": desc[:50]}
        for key in ("lng", "lat", "address"):
            val = item.get(key)
            if val is not None and val != "":
                row[key] = val
        out.append(row)
        if len(out) >= 4:
            break
    return out


def _fallback_from_amap(city: str) -> dict[str, Any]:
    """高德 POI / 本地精选库降级，返回真实景点与餐饮。"""
    empty: dict[str, Any] = {"city": city, "foods": [], "spots": []}
    amap = get_amap_client()
    if not (amap.api_key or "").strip():
        logger.warning("get_city_info amap fallback: 未配置 AMAP_API_KEY")
        return empty

    try:
        geo = amap.geocode(city)
        city_name = geo.city or city
        spots: list[dict[str, Any]] = []
        seen: set[str] = set()

        for name in resolve_landmarks(city, amap, limit=8):
            if name in seen:
                continue
            seen.add(name)
            spots.append({"name": name, "desc": f"{city_name}热门必去"})
            if len(spots) >= 4:
                break

        if len(spots) < 4:
            around = amap.search_poi_around(
                geo.location,
                POI_TYPES["attraction"],
                radius=25000,
                limit=16,
                city=city_name,
            )
            for poi in around:
                if poi.name in seen or is_micro_poi(poi.name):
                    continue
                seen.add(poi.name)
                spots.append(
                    _poi_to_item(poi, _poi_desc(poi, f"{city_name}人气景点")),
                )
                if len(spots) >= 4:
                    break

        meal_pois = amap.search_poi_around(
            geo.location,
            POI_TYPES["meal"],
            radius=20000,
            limit=12,
            city=city_name,
        )
        foods = [
            _poi_to_item(p, _poi_desc(p, "本地特色美食"))
            for p in meal_pois[:4]
            if p.name
        ]

        logger.info(
            "City info amap fallback city=%s foods=%d spots=%d",
            city,
            len(foods),
            len(spots),
        )
        return {"city": city, "foods": foods, "spots": spots}
    except AmapError as e:
        logger.warning("get_city_info amap fallback failed city=%s: %s", city, e)
        return empty
    except Exception:
        logger.exception("get_city_info amap fallback failed city=%s", city)
        return empty


def _try_llm(city: str, user: "User | None") -> dict[str, Any]:
    """调用 LLM 联网搜索，失败返回空 foods/spots。"""
    config = resolve_llm_config(user=user)
    provider = config["provider"]
    api_key = config["api_key"]
    model = config["model"]
    base_url = config["base_url"]

    empty: dict[str, Any] = {"city": city, "foods": [], "spots": []}
    if not api_key:
        logger.warning("get_city_info: 未配置 LLM API Key")
        return empty

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"城市：{city}\n\n请联网搜索这个城市的特色美食和热门景点。"},
        ],
        "temperature": 0.6,
        "max_tokens": 1024,
        "response_format": {"type": "json_object"},
    }

    if provider == "zhipu":
        body["tools"] = [{
            "type": "web_search",
            "web_search": {"enable": True, "search_result": False},
        }]

    logger.info("City info LLM search city=%s provider=%s model=%s", city, provider, model)

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            logger.warning("City info HTTP %s: %s", resp.status_code, resp.text[:300])
            return empty
        data = resp.json()

    content = data["choices"][0]["message"]["content"] or ""
    result = _parse_json_content(content)
    foods = _normalize_items(result.get("foods", []), fallback_desc="当地特色美食")
    spots = _normalize_items(result.get("spots", []), fallback_desc="热门打卡地")
    return {"city": city, "foods": foods, "spots": spots}


def _enrich_with_amap_location(city: str, items: list[dict[str, Any]], kind: str) -> None:
    """高德 POI 搜索补全经纬度与地址。"""
    if not items:
        return
    amap = get_amap_client()
    if not (amap.api_key or "").strip():
        return

    poi_type = POI_TYPES["meal"] if kind == "foods" else POI_TYPES["attraction"]

    def one(item: dict[str, Any]) -> None:
        if item.get("lng") is not None and item.get("lat") is not None:
            return
        name = str(item.get("name", "")).strip()
        if not name:
            return
        try:
            pois = amap.search_poi_by_keyword(
                name,
                city=city,
                limit=5,
                city_limit=True,
                poi_type=poi_type,
            )
            if not pois:
                pois = amap.search_poi_by_keyword(
                    f"{city}{name}",
                    city=city,
                    limit=5,
                    city_limit=True,
                )
            if not pois:
                return
            poi = pois[0]
            item["lng"] = poi.lng
            item["lat"] = poi.lat
            if poi.address and not item.get("address"):
                item["address"] = poi.address
        except Exception:
            logger.exception("amap location enrich failed city=%s name=%s", city, name)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(one, item) for item in items]
        try:
            for fut in as_completed(futures, timeout=12):
                try:
                    fut.result()
                except Exception:
                    pass
        except TimeoutError:
            logger.warning("amap location enrich timeout city=%s kind=%s", city, kind)


def _enrich_with_xhs_images(city: str, items: list[dict[str, Any]], kind: str) -> None:
    """并行拉取小红书笔记封面，写入 image / images 字段。"""
    if not items:
        return
    from app.services.xhs_image_client import fetch_xhs_images

    def one(item: dict[str, Any]) -> None:
        name = str(item.get("name", "")).strip()
        if not name:
            return
        try:
            imgs = fetch_xhs_images(city, name, kind, limit=3)
            if imgs:
                item["image"] = imgs[0]
                item["images"] = imgs
        except Exception:
            logger.exception("xhs image enrich failed city=%s name=%s", city, name)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(one, item) for item in items]
        try:
            for fut in as_completed(futures, timeout=18):
                try:
                    fut.result()
                except Exception:
                    pass
        except TimeoutError:
            logger.warning("xhs image enrich timeout city=%s kind=%s", city, kind)


def get_place_images(
    city: str,
    name: str,
    kind: str = "",
    limit: int = 3,
) -> dict[str, Any]:
    """单地点小红书图片（列表/详情懒加载）。"""
    from app.services.xhs_image_client import fetch_xhs_images

    city = (city or "").strip()
    name = (name or "").strip()
    imgs = fetch_xhs_images(city, name, kind, limit=max(1, min(limit, 6)))
    return {
        "city": city,
        "name": name,
        "kind": kind,
        "image": imgs[0] if imgs else None,
        "images": imgs,
    }


def _merge_llm_amap(llm_result: dict[str, Any], city: str) -> dict[str, Any]:
    """LLM 结果不足时用高德 POI 补全。"""
    if llm_result["foods"] and llm_result["spots"]:
        return llm_result

    amap_result = _fallback_from_amap(city)
    if not llm_result["foods"]:
        llm_result["foods"] = amap_result["foods"]
    if not llm_result["spots"]:
        llm_result["spots"] = amap_result["spots"]
    if not llm_result["foods"] and not llm_result["spots"]:
        return amap_result
    return llm_result


def _finalize_city_info(city: str, result: dict[str, Any]) -> dict[str, Any]:
    _enrich_with_amap_location(city, result.get("foods") or [], "foods")
    _enrich_with_amap_location(city, result.get("spots") or [], "spots")
    _enrich_with_xhs_images(city, result.get("foods") or [], "foods")
    _enrich_with_xhs_images(city, result.get("spots") or [], "spots")
    return result


def _stream_llm_city_search(
    city: str,
    user: "User | None",
) -> Generator[dict[str, Any], None, None]:
    """流式 LLM 联网搜索；末尾 yield {"_internal": "result", "data": ...}。"""
    config = resolve_llm_config(user=user)
    provider = config["provider"]
    api_key = config["api_key"]
    model = config["model"]
    base_url = config["base_url"]

    empty: dict[str, Any] = {"city": city, "foods": [], "spots": []}
    if not api_key:
        logger.warning("get_city_info: 未配置 LLM API Key")
        yield {"_internal": "result", "data": empty}
        return

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"城市：{city}\n\n请联网搜索这个城市的特色美食和热门景点。",
            },
        ],
        "temperature": 0.6,
        "max_tokens": 1024,
        "response_format": {"type": "json_object"},
        "stream": True,
    }

    if provider == "zhipu":
        body["tools"] = [{
            "type": "web_search",
            "web_search": {"enable": True, "search_result": False},
        }]

    logger.info(
        "City info LLM stream city=%s provider=%s model=%s",
        city,
        provider,
        model,
    )

    accumulated = ""
    try:
        with httpx.Client(timeout=90.0) as client:
            with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    err_text = resp.read().decode("utf-8", errors="replace")[:300]
                    logger.warning(
                        "City info stream HTTP %s: %s",
                        resp.status_code,
                        err_text,
                    )
                    yield {
                        "type": "error",
                        "message": f"联网搜索失败 (HTTP {resp.status_code})",
                    }
                    yield {"_internal": "result", "data": empty}
                    return

                for raw_line in resp.iter_lines():
                    line = raw_line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        reasoning = delta.get("reasoning_content", "")
                        if reasoning:
                            yield {"type": "reasoning", "content": reasoning}
                        content = delta.get("content", "")
                        if content:
                            accumulated += content
                            yield {"type": "preview", "content": content}
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass
    except httpx.HTTPError as e:
        logger.exception("City info stream HTTP error city=%s", city)
        yield {"type": "error", "message": f"网络错误：{e}"}
        yield {"_internal": "result", "data": empty}
        return
    except Exception as e:
        logger.exception("City info stream error city=%s", city)
        yield {"type": "error", "message": f"搜索出错：{e}"}
        yield {"_internal": "result", "data": empty}
        return

    if not accumulated.strip():
        yield {"_internal": "result", "data": empty}
        return

    try:
        parsed = _parse_json_content(accumulated)
        foods = _normalize_items(parsed.get("foods", []), fallback_desc="当地特色美食")
        spots = _normalize_items(parsed.get("spots", []), fallback_desc="热门打卡地")
        yield {
            "_internal": "result",
            "data": {"city": city, "foods": foods, "spots": spots},
        }
    except Exception:
        logger.exception("City info stream parse failed city=%s", city)
        yield {
            "type": "status",
            "phase": "parse",
            "message": "正在解析搜索结果…",
        }
        yield {"_internal": "result", "data": empty}


def city_info_stream(
    city: str,
    user: "User | None" = None,
) -> Generator[dict[str, Any], None, None]:
    """SSE 流式返回城市真实信息搜索进度与 LLM 预览。"""
    city = (city or "").strip()
    if not city:
        yield {"type": "result", "data": {"city": city, "foods": [], "spots": []}}
        return

    yield {
        "type": "status",
        "phase": "search",
        "message": f"正在联网搜索 {city} 的真实信息…",
    }

    llm_result: dict[str, Any] = {"city": city, "foods": [], "spots": []}
    try:
        for evt in _stream_llm_city_search(city, user):
            if evt.get("_internal") == "result":
                llm_result = evt["data"]
            else:
                yield evt
    except Exception:
        logger.exception("city_info_stream LLM failed for city=%s", city)

    if not (llm_result["foods"] and llm_result["spots"]):
        yield {
            "type": "status",
            "phase": "fallback",
            "message": f"正在从高德检索 {city} 本地 POI…",
        }

    result = _merge_llm_amap(llm_result, city)

    yield {
        "type": "status",
        "phase": "location",
        "message": "正在补全地点坐标与地址…",
    }
    _enrich_with_amap_location(city, result.get("foods") or [], "foods")
    _enrich_with_amap_location(city, result.get("spots") or [], "spots")

    yield {
        "type": "status",
        "phase": "images",
        "message": "正在抓取小红书真实图片…",
    }
    _enrich_with_xhs_images(city, result.get("foods") or [], "foods")
    _enrich_with_xhs_images(city, result.get("spots") or [], "spots")

    yield {"type": "result", "data": result}


def get_city_info(city: str, user: "User | None" = None) -> dict[str, Any]:
    """返回城市美食 + 景点。LLM 优先，不足时用高德 POI 降级。"""
    city = (city or "").strip()
    if not city:
        return {"city": city, "foods": [], "spots": []}

    try:
        llm_result = _try_llm(city, user)
    except Exception:
        logger.exception("get_city_info LLM failed for city=%s", city)
        llm_result = {"city": city, "foods": [], "spots": []}

    result = _merge_llm_amap(llm_result, city)
    return _finalize_city_info(city, result)
