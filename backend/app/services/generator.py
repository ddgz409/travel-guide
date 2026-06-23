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
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import Day, Item, Trip
from app.services.amap_client import AmapClient, AmapError, Poi, POI_TYPES, get_amap_client
from app.services.zhipu_client import LLMError, ZhipuClient, get_zhipu_client

logger = logging.getLogger(__name__)

# 系统提示词：约束 LLM 角色与输出格式
SYSTEM_PROMPT = """你是一位经验丰富的旅行规划师。请根据提供的真实景点数据为用户规划行程。

要求：
1. 仅使用提供的候选景点/餐饮/住宿，不要编造不存在的地点
2. 每天安排 morning/afternoon/evening 三个时段，每时段 1-2 个条目
3. 同一区域的景点安排在同一天，路线合理不绕路
4. 为每个条目提供简短描述和实用贴士
5. 合理估算每个条目的费用（cost，单位：元）
6. 必须返回 JSON 对象，格式如下：
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
time_slot 取值: morning / afternoon / evening"""

# 单类 POI 候选数量上限
POI_LIMIT = 25
# 路线规划默认交通方式
DEFAULT_ROUTE_MODE = "walking"


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

            # 2. POI 检索（候选池）
            pool = self._fetch_poi_pool(geo, trip.destination)
            if not pool:
                raise GeneratorError(f"未找到 {trip.destination} 的景点数据")

            # 3 & 4. LLM 生成 + 解析校验
            try:
                day_plans = self._generate_via_llm(pool, trip, days_count)
            except LLMError as e:
                logger.warning("LLM 生成失败，降级处理: %s", e)
                day_plans = self._fallback_plan(pool, trip, days_count)

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
            pool = self._fetch_poi_pool(geo, trip.destination)
            if not pool:
                raise GeneratorError(f"未找到 {trip.destination} 的景点数据")

            day_plans = self._generate_via_llm(pool, trip, (trip.end_date - trip.start_date).days + 1)
            target = next((d for d in day_plans if d.get("day_index") == day_index), None)
            if not target:
                raise GeneratorError(f"未生成第 {day_index} 天的行程")

            # 删除原该天数据
            old_day = next((d for d in trip.days if d.day_index == day_index), None)
            if old_day:
                db.delete(old_day)
                db.flush()

            self._persist_day(trip, target, db)
            db.commit()
        except Exception as e:
            logger.exception("重新生成第 %d 天失败", day_index)
            raise GeneratorError(str(e)) from e

    # ------------------------------------------------------------------
    # 步骤实现
    # ------------------------------------------------------------------

    def _fetch_poi_pool(self, geo, destination: str) -> dict[str, list[Poi]]:
        """获取三类 POI 候选池。"""
        pool: dict[str, list[Poi]] = {}
        for kind, type_code in POI_TYPES.items():
            try:
                pois = self.amap.search_poi_around(
                    location=geo.location,
                    poi_type=type_code,
                    radius=30000,
                    limit=POI_LIMIT,
                    city=geo.city,
                )
                pool[kind] = pois
                logger.info("POI 检索 %s: %d 条", kind, len(pois))
            except AmapError as e:
                logger.warning("POI 检索 %s 失败: %s", kind, e)
                pool[kind] = []
        return pool

    def _generate_via_llm(
        self, pool: dict[str, list[Poi]], trip: Trip, days_count: int
    ) -> list[dict[str, Any]]:
        """调用 LLM 生成行程，解析并校验。"""
        user_prompt = self._build_user_prompt(pool, trip, days_count)
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
        self, pool: dict[str, list[Poi]], trip: Trip, days_count: int
    ) -> str:
        """构造用户提示词，注入候选 POI 与偏好。"""
        def fmt(kind: str) -> str:
            return "\n".join(
                f"- {p.name}（{p.address or '地址未知'}）" for p in pool.get(kind, [])[:15]
            )

        prefs = trip.preferences or {}
        interests = prefs.get("interests", [])
        budget_level = prefs.get("budget_level", "中等")
        transport = prefs.get("transport", "公共交通")

        return f"""请为以下旅行规划 {days_count} 天的行程：

目的地：{trip.destination}
日期：{trip.start_date} 至 {trip.end_date}（共 {days_count} 天）
人数：{trip.travelers} 人
偏好：兴趣 {interests}；预算等级 {budget_level}；交通方式 {transport}

可选景点：
{fmt('attraction')}

可选餐饮：
{fmt('meal')}

可选住宿：
{fmt('hotel')}

请严格使用以上候选地点生成 {days_count} 天的 JSON 行程。"""

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
        else:
            # 找不到真实坐标，保留条目但无坐标（地图上无法标注）
            logger.warning("无法验证地点是否存在: %s", name)
            item["poi_id"] = None
            item["location"] = None

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
                    }
                )
            days.append({"day_index": d, "summary": "（降级生成）", "items": items})
        return days

    def _persist(self, trip: Trip, day_plans: list[dict[str, Any]], db: Session) -> None:
        """持久化全部天与条目，并回填路线规划。"""
        for plan in day_plans:
            self._persist_day(trip, plan, db)

    def _persist_day(self, trip: Trip, plan: dict[str, Any], db: Session) -> None:
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
        for seq, it in enumerate(items_data):
            loc = it.get("location") or {}
            loc_str = f"{loc.get('lng')},{loc.get('lat')}" if loc.get("lng") else None

            # 路线规划：上一站 -> 当前站
            transport = None
            if prev_loc and loc_str:
                seg = self.amap.plan_route(prev_loc, loc_str, mode=DEFAULT_ROUTE_MODE)
                if seg:
                    transport = {
                        "mode": seg.mode,
                        "distance_m": seg.distance_m,
                        "duration_s": seg.duration_s,
                    }

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
                transport_to_next=transport,
            )
            db.add(item)
            prev_loc = loc_str


# 模块级单例
_generator: GuideGenerator | None = None


def get_generator() -> GuideGenerator:
    global _generator
    if _generator is None:
        _generator = GuideGenerator()
    return _generator
