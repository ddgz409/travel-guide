"""目的地校验：地理编码 + 模糊推荐，避免无效地名进入生成流程。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import get_close_matches

from app.services.amap_client import AmapError, get_amap_client

# 常见旅游城市（用于「你是不是想找」）
COMMON_CITIES: tuple[str, ...] = (
    "北京", "上海", "广州", "深圳", "杭州", "成都", "西安", "南京", "苏州", "重庆",
    "武汉", "长沙", "厦门", "青岛", "大连", "三亚", "丽江", "拉萨", "昆明", "贵阳",
    "哈尔滨", "沈阳", "天津", "济南", "郑州", "合肥", "南昌", "福州", "南宁", "海口",
    "宁波", "无锡", "常州", "温州", "珠海", "桂林", "敦煌", "洛阳", "开封", "扬州",
    "威海", "烟台", "秦皇岛", "北戴河", "大理", "香格里拉", "九寨沟", "张家界", "黄山",
    "澳门", "香港", "台北", "乌鲁木齐", "呼和浩特", "银川", "西宁", "兰州", "太原",
    "石家庄", "长春", "顺德", "佛山", "东莞", "惠州", "绍兴", "嘉兴", "湖州", "泉州",
    "漳州", "湛江", "北海", "腾冲", "景德镇", "婺源", "莫干山", "千岛湖", "普陀山",
)


@dataclass
class DestinationCheckResult:
    valid: bool
    message: str = ""
    resolved_name: str | None = None
    suggestions: list[str] | None = None

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "message": self.message,
            "resolved_name": self.resolved_name,
            "suggestions": self.suggestions or [],
        }


# 知名环线 / 路线 -> 城市序列（用户输入「青甘环线」等即可展开）
RING_ROUTES: dict[str, list[str]] = {
    "青甘环线": ["西宁", "茶卡", "大柴旦", "敦煌", "张掖", "祁连", "西宁"],
    "甘南环线": ["兰州", "夏河", "扎尕那", "郎木寺", "玛曲", "若尔盖", "兰州"],
    "川西环线": ["成都", "康定", "新都桥", "稻城", "亚丁", "成都"],
    "西北大环线": ["西宁", "塔尔寺", "青海湖", "茶卡", "大柴旦", "敦煌", "嘉峪关", "张掖", "祁连", "西宁"],
    "新疆环线": ["乌鲁木齐", "吐鲁番", "喀纳斯", "禾木", "赛里木湖", "伊宁", "乌鲁木齐"],
    "云南大环线": ["昆明", "大理", "丽江", "香格里拉", "泸沽湖", "昆明"],
    "海南环岛": ["海口", "文昌", "琼海", "万宁", "陵水", "三亚", "东方", "儋州", "临高", "海口"],
    "海南环岛环线": ["海口", "文昌", "琼海", "万宁", "陵水", "三亚", "东方", "儋州", "临高", "海口"],
}

# 省份 -> 省内热门旅游城市序列（用户输入「山东」「云南」等即可展开成多城市路线）。
# 热门地级市优先排前面（天数不足时生成器会按顺序覆盖前几个城市）。
PROVINCE_CITIES: dict[str, list[str]] = {
    "北京": ["北京"],
    "上海": ["上海"],
    "天津": ["天津"],
    "重庆": ["重庆"],
    "山东": ["济南", "青岛", "威海", "烟台", "泰安", "曲阜"],
    "云南": ["昆明", "大理", "丽江", "香格里拉", "西双版纳", "泸沽湖"],
    "四川": ["成都", "九寨沟", "峨眉山", "乐山", "都江堰", "稻城"],
    "湖南": ["长沙", "张家界", "凤凰", "岳阳", "韶山"],
    "福建": ["厦门", "福州", "泉州", "武夷山", "漳州"],
    "江西": ["南昌", "九江", "景德镇", "婺源", "上饶"],
    "安徽": ["合肥", "黄山", "九华山", "宏村", "芜湖"],
    "贵州": ["贵阳", "黄果树", "西江千户苗寨", "荔波", "镇远"],
    "广西": ["桂林", "阳朔", "南宁", "北海", "涠洲岛"],
    "河南": ["郑州", "洛阳", "开封", "安阳", "焦作"],
    "湖北": ["武汉", "宜昌", "恩施", "神农架", "十堰"],
    "陕西": ["西安", "延安", "华山", "汉中", "宝鸡"],
    "山西": ["太原", "大同", "平遥", "五台山", "忻州"],
    "河北": ["石家庄", "承德", "秦皇岛", "张家口", "保定"],
    "辽宁": ["沈阳", "大连", "丹东", "锦州", "本溪"],
    "吉林": ["长春", "吉林", "延边", "长白山", "通化"],
    "黑龙江": ["哈尔滨", "牡丹江", "齐齐哈尔", "伊春", "黑河"],
    "江苏": ["南京", "苏州", "无锡", "扬州", "常州", "镇江"],
    "浙江": ["杭州", "宁波", "温州", "绍兴", "嘉兴", "金华"],
    "广东": ["广州", "深圳", "珠海", "汕头", "佛山", "潮州"],
    "甘肃": ["兰州", "敦煌", "张掖", "嘉峪关", "天水"],
    "新疆": ["乌鲁木齐", "喀纳斯", "伊犁", "吐鲁番", "禾木", "喀什"],
    "西藏": ["拉萨", "林芝", "日喀则", "纳木错", "珠峰"],
    "内蒙古": ["呼和浩特", "呼伦贝尔", "鄂尔多斯", "锡林郭勒", "额济纳", "阿拉善"],
    "宁夏": ["银川", "中卫", "沙坡头", "固原"],
    "青海": ["西宁", "青海湖", "茶卡", "祁连", "格尔木"],
    "海南": ["海口", "三亚", "文昌", "万宁", "陵水", "儋州"],
    "台湾": ["台北", "高雄", "花莲", "台中", "垦丁"],
    "香港": ["香港"],
    "澳门": ["澳门"],
}

# 省份表里用到的全部城市 -> 集合，check_route_city 直接信任（避免高德对县级地名编码过严）
PROVINCE_CITY_SET = frozenset(
    city for cities in PROVINCE_CITIES.values() for city in cities
)

# 省份名后缀（用于识别「山东省」「新疆维吾尔自治区」等写法）
_PROVINCE_SUFFIXES = ("省", "维吾尔自治区", "壮族自治区", "回族自治区", "自治区", "特别行政区", "市")

# 路线分隔符
_ROUTE_SEPS = re.compile(r"[-—–→→~·、,，;；/]+|(?:\s*[到至往]\s*)")

# 环线中常见但直接地理编码可能失败的县/镇级站点 -> 可被高德解析的别名
_ROUTE_CITY_ALIASES: dict[str, str] = {
    "茶卡": "茶卡盐湖",
    "大柴旦": "大柴旦镇",
    "祁连": "祁连县",
    "卓尔山": "祁连县卓尔山",
    "鸣沙山": "敦煌鸣沙山",
    "月牙泉": "敦煌月牙泉",
    "柴达木": "柴达木盆地",
    "黑马河": "青海湖黑马河",
    "若尔盖": "若尔盖县",
    "郎木寺": "碌曲县郎木寺",
    "亚丁": "稻城亚丁",
    "新都桥": "康定市新都桥镇",
    "泸沽湖": "宁蒗泸沽湖",
    "额济纳": "额济纳旗",
    "喀纳斯": "布尔津喀纳斯",
    "禾木": "布尔津禾木",
    # 海南环岛沿线市县（高德对县级地名地理编码过严，直接信任）
    "文昌": "文昌市",
    "琼海": "琼海市",
    "万宁": "万宁市",
    "陵水": "陵水黎族自治县",
    "东方": "东方市",
    "儋州": "儋州市",
    "临高": "临高县",
    "乐东": "乐东黎族自治县",
    "保亭": "保亭黎族苗族自治县",
    "五指山": "五指山市",
    "澄迈": "澄迈县",
    "屯昌": "屯昌县",
    "定安": "定安县",
    "琼中": "琼中黎族苗族自治县",
    "白沙": "白沙黎族自治县",
    "昌江": "昌江黎族自治县",
}


def _trusted_city(name: str) -> bool:
    """知名旅游城市直接信任（避免高德对县/镇级地名地理编码过严）。"""
    return name in COMMON_CITIES


def check_route_city(raw: str) -> DestinationCheckResult:
    """校验环线中的单个城市/站点。

    比 check_destination 更宽松：知名旅游城市或已登记的站点别名直接信任
    （避免高德对这县级景点只返回州级、匹配失败）；其余才严格地理编码防拼写错误。
    """
    name = (raw or "").strip()
    if not name:
        return DestinationCheckResult(valid=False, message="站点为空")
    if (
        _trusted_city(name)
        or name in _ROUTE_CITY_ALIASES
        or name in PROVINCE_CITY_SET
    ):
        return DestinationCheckResult(valid=True, message="", resolved_name=name)
    probe = _ROUTE_CITY_ALIASES.get(name, name)
    amap = get_amap_client()
    try:
        geo = amap.geocode(probe)
    except AmapError as e:
        return DestinationCheckResult(
            valid=False, message=_friendly_amap_message(name, e)
        )
    if not _geo_matches_input(name, geo) and not _geo_matches_input(probe, geo):
        return DestinationCheckResult(
            valid=False,
            message=f"未找到「{name}」的准确位置，请核对名称",
            suggestions=_suggest(name),
        )
    # 县级市：city 字段是州名，优先保留用户输入的原名
    dist = (getattr(geo, "district", "") or "").replace("[]", "").strip()
    if dist and _normalize_place(name) in _normalize_place(dist):
        return DestinationCheckResult(valid=True, message="", resolved_name=name)
    resolved = (geo.city or name).strip()
    resolved = resolved.replace("[]", "").strip() or name
    return DestinationCheckResult(valid=True, message="", resolved_name=resolved)


def _normalize_province(raw: str) -> str:
    """去掉省份后缀，得到规范省份名；非省份原样返回。"""
    text = (raw or "").strip()
    for suf in _PROVINCE_SUFFIXES:
        if text.endswith(suf) and len(text) > len(suf):
            cand = text[: -len(suf)]
            if cand in PROVINCE_CITIES:
                return cand
    if text in PROVINCE_CITIES:
        return text
    return ""


def is_province_name(raw: str) -> bool:
    return bool(_normalize_province(raw))


def parse_route(raw: str) -> tuple[list[str], bool]:
    """解析目的地为城市序列。

    返回 (cities, is_route)。若识别为多城市路线，cities 长度 >= 2。
    单城市原样返回 [raw]。
    """
    text = (raw or "").strip()
    if not text:
        return [], False
    # 已知环线名
    if text in RING_ROUTES:
        return list(RING_ROUTES[text]), True
    # 省份名 -> 省内热门城市序列（如「山东」→ 济南·青岛·威海…）
    prov = _normalize_province(text)
    if prov:
        return list(PROVINCE_CITIES[prov]), True
    # 「环线」关键词 + 起点：如「成都环线」→ 补全不了，仍按单城市处理
    # 显式分隔符拆分
    parts = [p for p in _ROUTE_SEPS.split(text) if p.strip()]
    # 去重保序
    seen: list[str] = []
    for p in parts:
        p = p.strip()
        if p and p not in seen:
            seen.append(p)
    if len(seen) >= 2:
        return seen, True
    return [text], False


def _suggest(raw: str) -> list[str]:
    q = raw.strip()
    if not q:
        return []
    hits = get_close_matches(q, COMMON_CITIES, n=5, cutoff=0.45)
    if hits:
        return hits
    # 子串匹配：输入「杭」→ 杭州
    partial = [c for c in COMMON_CITIES if q in c or c.startswith(q)]
    return partial[:5]


def _friendly_amap_message(raw: str, err: AmapError) -> str:
    text = str(err)
    if "无法解析" in text:
        base = f"未找到「{raw}」这个地点，请检查是否输错，或从下方热门城市中选择"
    elif "INVALID_USER_KEY" in text or "10001" in text:
        base = "地图服务暂不可用，请稍后再试"
    elif "DAILY_QUERY_OVER" in text or "10003" in text:
        base = "地图查询次数已达上限，请稍后再试"
    else:
        base = f"无法识别「{raw}」，请换一个真实存在的城市或区县名称"
    tips = _suggest(raw)
    if tips:
        base += f"。你是不是想找：{'、'.join(tips)}？"
    return base


def _normalize_place(s: str) -> str:
    return (
        s.replace("[]", "")
        .replace("市", "")
        .replace("省", "")
        .replace("自治区", "")
        .replace("特别行政区", "")
        .replace("地区", "")
        .strip()
    )


def _geo_matches_input(raw: str, geo) -> bool:
    """避免高德把生造地名漂移到无关城市。

    县级市（如德令哈）高德 city 字段返回州名或空，因此
    city / district / formatted 三处都参与匹配。
    """
    needle = _normalize_place(raw)
    if len(needle) < 2:
        return False
    haystacks = [
        _normalize_place(geo.city or ""),
        _normalize_place(getattr(geo, "district", "") or ""),
        _normalize_place(geo.formatted or ""),
    ]
    for hay in haystacks:
        if not hay:
            continue
        if needle in hay or hay in needle:
            return True
        if len(needle) >= 2 and hay[:2] == needle[:2]:
            return True
    # 兜底：区县级结果直接信任（level=区县/兴趣点 说明高德精确解析到了该地名）
    if (getattr(geo, "level", "") or "") in ("区县", "县"):
        return True
    return False


def check_destination(raw: str) -> DestinationCheckResult:
    """校验目的地是否可被高德地理编码识别（省份名直接视为有效）。"""
    name = (raw or "").strip()
    if not name:
        return DestinationCheckResult(valid=False, message="请输入目的地")
    # 省份名：直接有效（会展开成省内城市路线）
    prov = _normalize_province(name)
    if prov:
        return DestinationCheckResult(
            valid=True,
            message="",
            resolved_name=prov,
            suggestions=[],
        )
    if len(name) < 2:
        return DestinationCheckResult(
            valid=False,
            message="地名太短，请输入完整的城市或区县名称",
            suggestions=_suggest(name),
        )

    amap = get_amap_client()
    try:
        geo = amap.geocode(name)
    except AmapError as e:
        return DestinationCheckResult(
            valid=False,
            message=_friendly_amap_message(name, e),
            suggestions=_suggest(name),
        )

    if not _geo_matches_input(name, geo):
        tips = _suggest(name)
        msg = f"未找到「{name}」这个地点，请检查是否输错，或从下方热门城市中选择"
        if tips:
            msg += f"。你是不是想找：{'、'.join(tips)}？"
        return DestinationCheckResult(
            valid=False,
            message=msg,
            suggestions=tips,
        )

    resolved = (geo.city or name).strip()
    if resolved in ("[]", ""):
        resolved = name
    # 去掉高德返回的空数组字符串
    resolved = resolved.replace("[]", "").strip() or name
    # 县级市：city 是州名时保留用户输入（如「德令哈」不该变成海西州）
    dist = (getattr(geo, "district", "") or "").replace("[]", "").strip()
    if dist and _normalize_place(name) in _normalize_place(dist):
        resolved = name

    return DestinationCheckResult(
        valid=True,
        message="",
        resolved_name=resolved,
        suggestions=[],
    )
