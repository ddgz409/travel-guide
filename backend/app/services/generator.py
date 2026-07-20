"""攻略生成引擎 —— 系统核心。

编排式流程：
1. 地理编码（高德）→ 目的地坐标 + 城市
2. POI 检索（高德，并行）→ 景点/餐饮/住宿候选池
3. 构造 Prompt → 调用智谱 GLM（JSON 模式）
4. 解析校验 → 防编造（景点名必须在候选池或可被高德搜索命中）
5. 计算预算 + 路线规划回填
6. 持久化到数据库

鲁棒性：LLM 失败降级为候选池贪心排列；部分成功保留；独立超时重试。
"""
import logging
import math
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import Day, Item, Trip
from app.schemas.trip import EMPTY_EXTERNAL_REFS
from app.services.amap_client import AmapClient, AmapError, Poi, POI_TYPES, get_amap_client
from app.services.ctrip_client import search_ctrip
from app.services.ctrip_hotel_client import CtripHotel, search_ctrip_hotels
from app.services.web_search import search_travel_tips
from app.services.xiaohongshu_client import search_xiaohongshu
from app.services.zhipu_client import LLMError, ZhipuClient, get_zhipu_client

logger = logging.getLogger(__name__)

# 系统提示词：约束 LLM 角色与输出格式
SYSTEM_PROMPT = """你是一位经验丰富的旅行规划师。请根据提供的真实景点数据为用户规划行程。

核心原则：
1. 优先选择高评分（★4.0以上）和地标性景点，确保覆盖目的地最著名的必去之处
2. 如果用户指定了"必去景点"，必须全部包含在行程中
3. 仅使用提供的候选景点/餐饮/住宿，不要编造不存在的地点
4. 每天安排 morning/afternoon/evening 三个时段，每时段 1-2 个条目
5. 同一区域的景点安排在同一天，路线合理不绕路
6. 为每个条目提供简短描述和实用贴士
7. 合理估算每个条目的费用（cost，单位：元）
8. 必须返回 JSON 对象，格式如下：
{
  "days": [
    {
      "day_index": 1,
      "summary": "当日行程概述",
      "items": [
        {
          "time_slot": "morning",
          "type": "attraction",
          "name": "景点名（须来自候选列表）",
          "duration_min": 120,
          "description": "简短描述与贴士",
          "cost": 0
        }
      ]
    }
  ]
}
type 取值: attraction / meal / hotel / transport
time_slot 取值: morning / afternoon / evening
9. 若提供了小红书/携程参考链接，地点名称仍必须来自候选列表
10. 住宿极其重要：必须从住宿候选列表靠前的酒店中选择（已按「靠近主要景点、总交通最短」排序）；全程尽量住同一家，减少往返；勿选远离景点的酒店"""

# 单类 POI 候选数量上限
POI_LIMIT = 25
# 路线规划：步行上限（米），超过则改用公交/地铁
WALK_MAX_DISTANCE_M = 1500


def _min_to_time(minutes: int) -> str:
    """分钟数转 HH:MM 格式。"""
    h = (minutes // 60) % 24
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


class GeneratorError(Exception):
    """生成引擎错误。"""


class GuideGenerator:
    """攻略生成引擎。"""

    def __init__(
        self,
        amap: AmapClient | None = None,
        llm: ZhipuClient | None = None,
    ) -> None:
        self.amap = amap or get_amap_client()
        self.llm = llm or get_zhipu_client()

    def generate(self, trip: Trip, db: Session) -> None:
        """生成完整攻略并写入数据库。失败时标记 status=failed。

        在后台任务中调用。
        """
        try:
            days_count = (trip.end_date - trip.start_date).days + 1
            if days_count < 1:
                raise GeneratorError("行程天数无效")

            # 1. 地理编码
            geo = self.amap.geocode(trip.destination)
            logger.info("地理编码 %s -> %s", trip.destination, geo.location)

            # 2. POI 检索（候选池）—— 扩大半径 + 按评分排序
            must_include = (trip.preferences or {}).get("must_include") or []
            pool = self._fetch_poi_pool(geo, trip.destination, must_include)
            if not pool:
                raise GeneratorError(f"未找到 {trip.destination} 的景点数据")

            # 2.4 携程酒店现爬 → 按「靠近景点 / 总交通最短」重排后并入住宿池
            pool, hotel_status, hotel_cands = self._merge_ctrip_hotels(
                pool, trip.destination
            )
            trip.hotel_fetch_status = hotel_status
            trip.hotel_candidates = hotel_cands
            db.commit()
            logger.info(
                "ctrip hotels %s: status=%s candidates=%d",
                trip.destination,
                hotel_status,
                len(hotel_cands),
            )

            # 2.5 网页搜索：获取公开的旅游攻略摘要作为 LLM 参考
            web_results = search_travel_tips(trip.destination, max_results=8)
            logger.info("网页搜索 %s: %d 条摘要", trip.destination, len(web_results))

            external_refs = self._fetch_external_refs(trip.destination)
            trip.external_refs = external_refs
            db.commit()
            logger.info(
                "external_refs %s: xhs=%d ctrip=%d",
                trip.destination,
                len(external_refs.get("xiaohongshu") or []),
                len(external_refs.get("ctrip") or []),
            )

            # 3 & 4. LLM 生成 + 解析校验
            try:
                day_plans = self._generate_via_llm(
                    pool, trip, days_count, web_results, external_refs
                )
            except LLMError as e:
                logger.warning("LLM 生成失败，降级处理: %s", e)
                day_plans = self._fallback_plan(pool, trip, days_count)

            # 4.5 强制选用「离行程景点总距离最短」的酒店
            self._assign_nearest_hotel(day_plans, pool)

            # 5 & 6. 持久化
            self._persist(trip, day_plans, db)

            # 计算预算总额
            total = sum(it.get("cost", 0) or 0 for d in day_plans for it in d.get("items", []))
            trip.budget_total = float(total) * trip.travelers
            trip.status = "ready"
            trip.error_msg = None
            db.commit()
            logger.info("攻略 %s 生成完成，%d 天", trip.id, len(day_plans))

        except Exception as e:
            logger.exception("攻略生成失败 trip=%s", trip.id)
            trip.status = "failed"
            trip.error_msg = str(e)[:500]
            db.commit()

    def regenerate_day(self, trip: Trip, day_index: int, db: Session) -> None:
        """重新生成指定某一天。"""
        try:
            geo = self.amap.geocode(trip.destination)
            must_include = (trip.preferences or {}).get("must_include") or []
            pool = self._fetch_poi_pool(geo, trip.destination, must_include)
            if not pool:
                raise GeneratorError(f"未找到 {trip.destination} 的景点数据")

            web_results = search_travel_tips(trip.destination, max_results=8)
            day_plans = self._generate_via_llm(pool, trip, (trip.end_date - trip.start_date).days + 1, web_results)
            target = next((d for d in day_plans if d.get("day_index") == day_index), None)
            if not target:
                raise GeneratorError(f"未生成第 {day_index} 天的行程")

            # 删除原该天数据
            old_day = next((d for d in trip.days if d.day_index == day_index), None)
            if old_day:
                db.delete(old_day)
                db.flush()

            self._persist_day(trip, target, db, trip.destination)
            db.commit()
        except Exception as e:
            logger.exception("重新生成第 %d 天失败", day_index)
            raise GeneratorError(str(e)) from e

    # ------------------------------------------------------------------
    # 步骤实现
    # ------------------------------------------------------------------

    def _fetch_poi_pool(self, geo, destination: str, must_include: list[dict] | None = None) -> dict[str, list[Poi]]:
        """获取三类 POI 候选池。扩大半径，按评分排序，确保必去景点在列。"""
        must_include = must_include or []
        pool: dict[str, list[Poi]] = {}
        for kind, type_code in POI_TYPES.items():
            try:
                pois = self.amap.search_poi_around(
                    location=geo.location,
                    poi_type=type_code,
                    radius=50000,      # 扩大到 50km
                    limit=POI_LIMIT,
                    city=geo.city,
                )
                # 按评分降序排序
                pois.sort(key=lambda p: p.rating or 0, reverse=True)
                pool[kind] = pois
                logger.info("POI 检索 %s: %d 条 (top评分: %.1f)", kind, len(pois), pois[0].rating if pois else 0)
            except AmapError as e:
                logger.warning("POI 检索 %s 失败: %s", kind, e)
                pool[kind] = []

        # 确保 must_include 景点在候选池中（如果高德没搜到，用关键词搜索补）
        for mi in must_include:
            name = mi.get("name", "")
            if not name:
                continue
            found = any(name in p.name or p.name in name for p in pool.get("attraction", []))
            if not found:
                try:
                    results = self.amap.search_poi_by_keyword(name, city=geo.city, limit=1)
                    if results:
                        pool["attraction"].insert(0, results[0])  # 插到最前面
                        logger.info("must_include 补入候选池: %s", name)
                except AmapError:
                    pass

        return pool

    def _fetch_external_refs(self, destination: str) -> dict[str, list]:
        """并行爬取小红书/携程；单源失败返回空列表。"""
        refs = {k: [] for k in EMPTY_EXTERNAL_REFS}
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = {
                pool.submit(search_xiaohongshu, destination): "xiaohongshu",
                pool.submit(search_ctrip, destination): "ctrip",
            }
            for fut in as_completed(futures):
                key = futures[fut]
                try:
                    refs[key] = fut.result() or []
                except Exception as e:
                    logger.warning("external_refs %s failed: %s", key, e)
                    refs[key] = []
        return refs

    def _merge_ctrip_hotels(
        self, pool: dict[str, list[Poi]], destination: str
    ) -> tuple[dict[str, list[Poi]], str, list[dict]]:
        """现爬携程酒店并与高德合并，再按「靠近主要景点」重排（总距离最短优先）。"""
        amap_hotels = list(pool.get("hotel") or [])
        anchors = self._attraction_anchors(pool)
        try:
            ctrip_hotels = search_ctrip_hotels(destination, max_results=20)
        except Exception as e:
            logger.warning("ctrip hotel scrape failed: %s", e)
            ctrip_hotels = []

        ctrip_pois: list[Poi] = []
        ctrip_by_name: dict[str, CtripHotel] = {}
        for h in ctrip_hotels:
            poi = self._ctrip_hotel_to_poi(h, destination)
            if poi:
                ctrip_pois.append(poi)
                ctrip_by_name[self._norm_hotel_name(h.name)] = h

        status = "ok" if ctrip_pois else "amap_only"
        seen = {self._norm_hotel_name(p.name) for p in ctrip_pois}
        merged = ctrip_pois[:]
        for p in amap_hotels:
            key = self._norm_hotel_name(p.name)
            if key in seen:
                continue
            seen.add(key)
            merged.append(p)

        # 核心：按到景点锚点的平均距离重排（越近越靠前）；华住/好评作轻微加权
        ranked = self._rank_hotels_by_proximity(merged, anchors, ctrip_by_name)
        ranked = ranked[:POI_LIMIT]

        pool = dict(pool)
        pool["hotel"] = ranked

        candidates: list[dict] = []
        for p in ranked[:12]:
            key = self._norm_hotel_name(p.name)
            base = ctrip_by_name.get(key)
            if base:
                cand = base.to_candidate()
            else:
                cand = {
                    "name": p.name,
                    "url": "",
                    "score": 0,
                    "tags": [],
                    "good_rate": (p.rating or 0) * 20 if p.rating else None,
                    "open_year": None,
                    "is_huazhu": "华住" in (p.note or "") or any(
                        k in p.name for k in ("全季", "汉庭", "桔子", "宜必思", "漫心")
                    ),
                    "metro_distance_m": None,
                }
            dist = self._mean_dist_to_anchors(p, anchors)
            if dist is not None:
                cand["avg_dist_m"] = int(dist)
                tags = list(cand.get("tags") or [])
                if dist <= 1500 and "近景点" not in tags:
                    tags.insert(0, "近景点")
                elif dist <= 3000 and "较近景点" not in tags:
                    tags.insert(0, "较近景点")
                cand["tags"] = tags
            if p.note and "近景点" in p.note:
                pass
            candidates.append(cand)

        logger.info(
            "hotels ranked by proximity: top=%s dist=%s",
            ranked[0].name if ranked else None,
            candidates[0].get("avg_dist_m") if candidates else None,
        )
        return pool, status, candidates

    @staticmethod
    def _norm_hotel_name(name: str) -> str:
        return re.sub(r"[\s·•\-—（）()]+", "", (name or "").lower())

    @staticmethod
    def _haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
        r = 6371000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlmb = math.radians(lng2 - lng1)
        a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
        return 2 * r * math.asin(min(1.0, math.sqrt(a)))

    def _attraction_anchors(self, pool: dict[str, list[Poi]], top_n: int = 12) -> list[Poi]:
        attrs = [
            p for p in (pool.get("attraction") or [])
            if p.lng and p.lat and abs(p.lng) > 0.01 and abs(p.lat) > 0.01
        ]
        return attrs[:top_n]

    def _mean_dist_to_anchors(self, hotel: Poi, anchors: list[Poi]) -> float | None:
        if not anchors or not hotel.lng or not hotel.lat:
            return None
        if abs(hotel.lng) < 0.01 and abs(hotel.lat) < 0.01:
            return None
        dists = [
            self._haversine_m(hotel.lng, hotel.lat, a.lng, a.lat) for a in anchors
        ]
        # 用最近 5 个景点的平均距离，更贴近「住在玩的地方附近」
        nearest = sorted(dists)[: min(5, len(dists))]
        return sum(nearest) / len(nearest)

    def _rank_hotels_by_proximity(
        self,
        hotels: list[Poi],
        anchors: list[Poi],
        ctrip_by_name: dict[str, CtripHotel],
    ) -> list[Poi]:
        """距离权重最高，华住/好评轻微加分。"""

        def sort_key(p: Poi) -> tuple:
            dist = self._mean_dist_to_anchors(p, anchors)
            # 无坐标的排最后
            dist_key = dist if dist is not None else 9_999_999.0
            soft = 0.0
            ch = ctrip_by_name.get(self._norm_hotel_name(p.name))
            if ch:
                soft = ch.score
            elif p.rating:
                soft = (p.rating or 0) * 15
            if any(k in p.name for k in ("全季", "汉庭", "桔子", "宜必思", "漫心", "华住")):
                soft += 20
            # 距离（米）为主：越小越好；软分作次要（取负）
            note = ""
            if dist is not None:
                if dist <= 1500:
                    note = "近景点"
                elif dist <= 3000:
                    note = "较近景点"
                km = dist / 1000
                extra = f"距景点约{km:.1f}km"
                note = f"{note}·{extra}" if note else extra
            if note:
                base_note = (p.note or "").strip("·")
                p.note = f"{note}·{base_note}" if base_note else note
            return (dist_key, -soft)

        return sorted(hotels, key=sort_key)

    def _assign_nearest_hotel(
        self, day_plans: list[dict[str, Any]], pool: dict[str, list[Poi]]
    ) -> None:
        """根据行程中景点坐标，强制选用总距离最短的酒店（全程同一家）。"""
        hotels = [
            p for p in (pool.get("hotel") or [])
            if p.lng and p.lat and abs(p.lng) > 0.01
        ]
        if not hotels:
            return

        anchors: list[tuple[float, float]] = []
        for d in day_plans:
            for it in d.get("items") or []:
                if it.get("type") != "attraction":
                    continue
                loc = it.get("location") or {}
                lng, lat = loc.get("lng"), loc.get("lat")
                if lng and lat and abs(float(lng)) > 0.01:
                    anchors.append((float(lng), float(lat)))

        if anchors:
            def total_dist(h: Poi) -> float:
                ds = sorted(
                    self._haversine_m(h.lng, h.lat, lng, lat) for lng, lat in anchors
                )
                nearest = ds[: min(5, len(ds))]
                return sum(nearest) / len(nearest)

            best = min(hotels, key=total_dist)
            avg = total_dist(best)
        else:
            best = hotels[0]
            avg = self._mean_dist_to_anchors(best, self._attraction_anchors(pool))

        tip = "已优选：靠近主要景点，缩短多日交通时间"
        if avg is not None:
            tip += f"（到景点均距约{avg/1000:.1f}km）"

        for d in day_plans:
            items = d.setdefault("items", [])
            hotel_items = [it for it in items if it.get("type") == "hotel"]
            payload = {
                "time_slot": "evening",
                "type": "hotel",
                "name": best.name,
                "duration_min": 0,
                "description": tip,
                "cost": 0,
                "poi_id": best.id,
                "location": {
                    "lng": best.lng,
                    "lat": best.lat,
                    "address": best.address,
                },
                "rating": best.rating,
            }
            if hotel_items:
                for it in hotel_items:
                    it.update(payload)
                    it["time_slot"] = it.get("time_slot") or "evening"
            else:
                items.append(payload)
        logger.info("assigned nearest hotel: %s avg_m=%s", best.name, avg)

    def _ctrip_hotel_to_poi(self, h: CtripHotel, destination: str) -> Poi | None:
        """携程酒店转 Poi；用高德补坐标。"""
        note = "·".join(h.tags) if h.tags else "携程推荐"
        rating = None
        if h.good_rate is not None:
            rating = round(min(5.0, h.good_rate / 20.0), 1)
        try:
            results = self.amap.search_poi_by_keyword(h.name, city=destination, limit=1)
        except AmapError as e:
            logger.warning("enrich ctrip hotel '%s' failed: %s", h.name, e)
            results = []
        if results:
            p = results[0]
            return Poi(
                id=p.id or f"ctrip-{abs(hash(h.name)) % 10_000_000}",
                name=h.name,
                type="hotel",
                lng=p.lng,
                lat=p.lat,
                address=p.address or destination,
                rating=rating or p.rating,
                note=note,
            )
        return Poi(
            id=f"ctrip-{abs(hash(h.name)) % 10_000_000}",
            name=h.name,
            type="hotel",
            lng=0.0,
            lat=0.0,
            address=destination,
            rating=rating,
            note=note,
        )

    def _generate_via_llm(
        self, pool: dict[str, list[Poi]], trip: Trip, days_count: int,
        web_results: list[dict[str, Any]] | None = None,
        external_refs: dict | None = None,
    ) -> list[dict[str, Any]]:
        """调用 LLM 生成行程，解析并校验。"""
        user_prompt = self._build_user_prompt(
            pool, trip, days_count, web_results, external_refs
        )
        result = self.llm.chat_json(SYSTEM_PROMPT, user_prompt)

        days = result.get("days")
        if not isinstance(days, list) or not days:
            raise LLMError("LLM 返回的 days 字段为空或格式错误")

        # 校验并补全每个条目
        for d in days:
            for item in d.get("items", []):
                self._validate_and_enrich(item, pool, trip.destination)

        return days

    def _build_user_prompt(
        self, pool: dict[str, list[Poi]], trip: Trip, days_count: int,
        web_results: list[dict[str, Any]] | None = None,
        external_refs: dict | None = None,
    ) -> str:
        """构造用户提示词，注入候选 POI（含评分）+ 网页摘要。"""
        def fmt(kind: str) -> str:
            lines = []
            for p in pool.get(kind, [])[:20]:
                rating_str = f" ★{p.rating}" if p.rating else ""
                note_str = f" [{p.note}]" if getattr(p, "note", "") else ""
                lines.append(f"- {p.name}{rating_str}{note_str}（{p.address or '地址未知'}）")
            return "\n".join(lines)

        prefs = trip.preferences or {}
        interests = prefs.get("interests", [])
        budget_level = prefs.get("budget_level", "中等")
        transport = prefs.get("transport", "公共交通")
        must_include = prefs.get("must_include") or []

        # 必去景点提示
        must_section = ""
        if must_include:
            names = [m.get("name", "") for m in must_include if m.get("name")]
            if names:
                must_section = f"\n⚠️ 用户指定的必去景点（必须全部安排！）：\n" + "\n".join(f"- {n}" for n in names)

        # 网页搜索摘要 + 正文
        web_section = ""
        if web_results:
            parts = []
            for r in web_results[:6]:
                snippet = r.get("snippet", "")
                content = r.get("content", "")  # 抓取的网页正文
                if content:
                    # 有正文时优先用正文，截取前 800 字
                    parts.append(f"【{r.get('title', '')[:50]}】\n{content[:800]}")
                elif snippet:
                    parts.append(f"- {snippet[:200]}")
            if parts:
                web_section = f"\n📖 网上关于{trip.destination}的攻略参考（来自马蜂窝/穷游等公开攻略，请据此总结最佳行程建议）：\n" + "\n\n".join(parts)

        ext_section = ""
        if external_refs:
            parts = []
            for source, label in (("xiaohongshu", "小红书"), ("ctrip", "携程")):
                items = (external_refs.get(source) or [])[:4]
                if not items:
                    continue
                lines = []
                for it in items:
                    sn = (it.get("snippet") or "").strip()
                    line = f"- {it.get('title', '')}"
                    if sn:
                        line += f"：{sn[:200]}"
                    lines.append(line)
                parts.append(f"【{label}】\n" + "\n".join(lines))
            if parts:
                ext_section = (
                    f"\n📱 小红书/携程口碑参考（仅作玩法与热度参考，地点必须来自候选列表）：\n"
                    + "\n\n".join(parts)
                )

        has_ext = bool(
            external_refs
            and (
                (external_refs.get("xiaohongshu") or [])
                or (external_refs.get("ctrip") or [])
            )
        )
        closing_hints = ""
        if web_results:
            closing_hints += "同时参考网上攻略建议，合理规划路线。"
        if has_ext:
            closing_hints += "并参考小红书/携程口碑。"

        return f"""请为以下旅行规划 {days_count} 天的行程：

目的地：{trip.destination}
日期：{trip.start_date} 至 {trip.end_date}（共 {days_count} 天）
人数：{trip.travelers} 人
偏好：兴趣 {interests}；预算等级 {budget_level}；交通方式 {transport}{must_section}{web_section}{ext_section}

可选景点（按评分降序，优先选前面高分景点）：
{fmt('attraction')}

可选餐饮：
{fmt('meal')}

可选住宿（已按「靠近主要景点、总交通最短」排序，越靠前越好；请全程优先选第 1 家）：
{fmt('hotel')}

请严格使用以上候选地点生成 {days_count} 天的 JSON 行程。优先安排高评分和地标性景点；住宿必须选列表最靠前且靠近景点的酒店，全程同一家以减少交通时间。{closing_hints}"""

    def _validate_and_enrich(
        self, item: dict[str, Any], pool: dict[str, list[Poi]], destination: str
    ) -> None:
        """校验条目景点名真实存在（防编造），并补全坐标。

        不存在的景点用高德关键词搜索补坐标；仍找不到则保留但标记。
        """
        name = item.get("name", "")
        item_type = item.get("type", "attraction")

        # 1. 在候选池中查找
        matched = self._find_in_pool(name, pool, item_type)

        # 2. 候选池没命中，用关键词搜索（防编造校验）
        if matched is None:
            try:
                results = self.amap.search_poi_by_keyword(name, city=destination, limit=1)
                if results:
                    matched = results[0]
                    logger.info("关键词补全坐标: %s", name)
            except AmapError:
                pass

        # 3. 补全 location 与 poi_id
        if matched is not None:
            item["poi_id"] = matched.id
            item["location"] = {
                "lng": matched.lng,
                "lat": matched.lat,
                "address": matched.address,
            }
            item["rating"] = matched.rating
        else:
            # 找不到真实坐标，保留条目但无坐标（地图上无法标注）
            logger.warning("无法验证地点是否存在: %s", name)
            item["poi_id"] = None
            item["location"] = None
            item["rating"] = None

        # 4. 收集备选 POI（用于"换一个"功能）：取候选池中同类型、未被本条目命中的
        item["alternatives"] = self._collect_alternatives(matched, pool, item_type)

        # 规范化字段
        item.setdefault("duration_min", 90)
        item.setdefault("cost", 0)
        item.setdefault("description", "")

    @staticmethod
    def _find_in_pool(name: str, pool: dict[str, list[Poi]], item_type: str) -> Poi | None:
        """在候选池中按名称匹配（模糊包含）。"""
        kind = item_type if item_type in POI_TYPES else "attraction"
        for p in pool.get(kind, []):
            if name and (name in p.name or p.name in name):
                return p
        # 跨类型兜底查找
        for pois in pool.values():
            for p in pois:
                if name and (name in p.name or p.name in name):
                    return p
        return None

    @staticmethod
    def _collect_alternatives(
        matched: Poi | None, pool: dict[str, list[Poi]], item_type: str
    ) -> list[dict[str, Any]]:
        """收集备选 POI（用于前端"换一个"功能）。

        取候选池中同类型、未被当前命中的 POI，最多 5 个，按评分降序。
        """
        kind = item_type if item_type in POI_TYPES else "attraction"
        pois = pool.get(kind, [])
        candidates = [p for p in pois if matched is None or p.id != matched.id]
        # 按评分降序
        candidates.sort(key=lambda p: p.rating or 0, reverse=True)
        result: list[dict[str, Any]] = []
        for p in candidates[:5]:
            result.append(
                {
                    "poi_id": p.id,
                    "name": p.name,
                    "location": {
                        "lng": p.lng,
                        "lat": p.lat,
                        "address": p.address,
                    },
                    "rating": p.rating,
                    "address": p.address,
                }
            )
        return result

    def _fallback_plan(
        self, pool: dict[str, list[Poi]], trip: Trip, days_count: int
    ) -> list[dict[str, Any]]:
        """LLM 失败时的降级方案：候选池按评分贪心排列。

        无文字描述，仅基础结构。
        """
        attractions = sorted(
            pool.get("attraction", []),
            key=lambda p: p.rating or 0,
            reverse=True,
        )
        meals = pool.get("meal", [])[:days_count]
        days: list[dict[str, Any]] = []
        per_day = max(1, len(attractions) // days_count)
        idx = 0
        for d in range(1, days_count + 1):
            items: list[dict[str, Any]] = []
            daily = attractions[idx : idx + per_day]
            idx += per_day
            for j, p in enumerate(daily):
                slot = "morning" if j == 0 else "afternoon"
                items.append(
                    {
                        "time_slot": slot,
                        "type": "attraction",
                        "name": p.name,
                        "duration_min": 120,
                        "description": "",
                        "cost": 0,
                        "poi_id": p.id,
                        "location": {
                            "lng": p.lng,
                            "lat": p.lat,
                            "address": p.address,
                        },
                        "rating": p.rating,
                        "alternatives": [],
                    }
                )
            if meals:
                m = meals[(d - 1) % len(meals)]
                items.append(
                    {
                        "time_slot": "evening",
                        "type": "meal",
                        "name": m.name,
                        "duration_min": 90,
                        "description": "",
                        "cost": 100,
                        "poi_id": m.id,
                        "location": {
                            "lng": m.lng,
                            "lat": m.lat,
                            "address": m.address,
                        },
                        "rating": m.rating,
                        "alternatives": [],
                    }
                )
            days.append({"day_index": d, "summary": "（降级生成）", "items": items})
        return days

    def _persist(self, trip: Trip, day_plans: list[dict[str, Any]], db: Session) -> None:
        """持久化全部天与条目，并回填路线规划。"""
        for plan in day_plans:
            self._persist_day(trip, plan, db, trip.destination)

    def _persist_day(self, trip: Trip, plan: dict[str, Any], db: Session, city: str = "") -> None:
        """持久化单天及其条目，含路线规划回填。"""
        day_index = int(plan.get("day_index", 1))
        day_date = trip.start_date + timedelta(days=day_index - 1)
        day = Day(
            trip_id=trip.id,
            day_index=day_index,
            date=day_date,
            summary=plan.get("summary"),
        )
        db.add(day)
        db.flush()  # 拿到 day.id

        items_data = plan.get("items", [])
        prev_loc: str | None = None
        # 估算时间：从 9:00 开始累加（停留+交通）
        current_time_min = 9 * 60  # 9:00 = 540 分钟
        for seq, it in enumerate(items_data):
            loc = it.get("location") or {}
            loc_str = f"{loc.get('lng')},{loc.get('lat')}" if loc.get("lng") else None

            # 估算出发时间（从上一站离开的时刻）
            departure_time = current_time_min if prev_loc else None

            # 路线规划：上一站 -> 当前站，按距离自动选交通方式
            transport = None
            if prev_loc and loc_str:
                # 先步行规划拿距离
                walk_seg = self.amap.plan_route(prev_loc, loc_str, mode="walking")
                if walk_seg:
                    if walk_seg.distance_m <= WALK_MAX_DISTANCE_M:
                        # 近距离：步行
                        transport = {
                            "mode": "walking",
                            "distance_m": walk_seg.distance_m,
                            "duration_s": walk_seg.duration_s,
                            "detail": None,
                        }
                        current_time_min += walk_seg.duration_s // 60
                    else:
                        # 远距离：优先公交/地铁，失败则用驾车
                        seg = self.amap.plan_route(prev_loc, loc_str, mode="transit", city=city)
                        if seg is None:
                            seg = self.amap.plan_route(prev_loc, loc_str, mode="driving")
                        if seg:
                            transport = {
                                "mode": seg.mode,
                                "distance_m": seg.distance_m,
                                "duration_s": seg.duration_s,
                                "detail": seg.detail,
                            }
                        else:
                            # 兜底用步行数据
                            transport = {
                                "mode": "walking",
                                "distance_m": walk_seg.distance_m,
                                "duration_s": walk_seg.duration_s,
                                "detail": None,
                            }
                        current_time_min += seg.duration_s // 60 if seg else walk_seg.duration_s // 60
                # 估算到达时间
                if transport:
                    transport["departure_time"] = _min_to_time(departure_time) if departure_time else None
                    transport["arrival_time"] = _min_to_time(current_time_min)

            item = Item(
                day_id=day.id,
                seq=seq,
                time_slot=it.get("time_slot", "morning"),
                type=it.get("type", "attraction"),
                name=it.get("name", ""),
                poi_id=it.get("poi_id"),
                location=it.get("location"),
                description=it.get("description"),
                duration_min=it.get("duration_min"),
                cost=float(it.get("cost") or 0),
                rating=it.get("rating"),
                selected=True,
                alternatives=it.get("alternatives"),
                transport_to_next=transport,
            )
            db.add(item)
            prev_loc = loc_str
            # 累加停留时间
            stay = it.get("duration_min") or 90
            current_time_min += stay


# 模块级单例
_generator: GuideGenerator | None = None


def get_generator() -> GuideGenerator:
    global _generator
    if _generator is None:
        _generator = GuideGenerator()
    return _generator
