"""热门必去景点库 —— 注入候选池，避免高德周边搜到过多打卡点子点。

优先用本地精选库；未收录城市走高德风景名胜检索，并做内存+磁盘缓存。
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.amap_client import AmapClient

logger = logging.getLogger(__name__)

# 城市名关键字 → 必去景点（按推荐优先级）
LANDMARKS: dict[str, list[str]] = {
    "北京": [
        "故宫博物院", "天安门广场", "八达岭长城", "颐和园", "天坛公园",
        "景山公园", "北海公园", "圆明园", "南锣鼓巷", "什刹海", "恭王府",
        "雍和宫", "鸟巢", "国家游泳中心水立方", "798艺术区", "前门大街",
        "王府井", "慕田峪长城", "香山公园", "中国国家博物馆",
    ],
    "上海": [
        "外滩", "东方明珠", "豫园", "南京路步行街", "田子坊", "上海迪士尼乐园",
        "陆家嘴", "武康路", "静安寺", "朱家角古镇", "上海博物馆", "新天地",
    ],
    "杭州": [
        "西湖", "灵隐寺", "西溪湿地", "河坊街", "雷峰塔", "断桥", "宋城",
        "九溪烟树", "龙井村", "千岛湖",
    ],
    "成都": [
        "宽窄巷子", "锦里古街", "大熊猫繁育研究基地", "武侯祠", "杜甫草堂",
        "春熙路", "太古里", "青城山", "都江堰", "人民公园",
    ],
    "西安": [
        "兵马俑", "大雁塔", "西安城墙", "回民街", "钟楼", "鼓楼",
        "大唐不夜城", "华清宫", "陕西历史博物馆", "小雁塔",
    ],
    "广州": [
        "广州塔", "陈家祠", "沙面", "珠江夜游", "永庆坊", "白云山",
        "长隆旅游度假区", "北京路步行街",
    ],
    "深圳": [
        "世界之窗", "欢乐谷", "大梅沙", "莲花山公园", "深圳湾公园",
        "华侨城", "中英街",
    ],
    "南京": [
        "中山陵", "夫子庙", "玄武湖", "总统府", "明孝陵", "鸡鸣寺",
        "南京博物院", "秦淮河",
    ],
    "重庆": [
        "洪崖洞", "解放碑", "磁器口古镇", "长江索道", "武隆天生三桥",
        "大足石刻", "朝天门", "李子坝轻轨站",
    ],
    "苏州": [
        "拙政园", "虎丘", "平江路", "留园", "寒山寺", "同里古镇",
        "周庄古镇", "金鸡湖",
    ],
    "厦门": [
        "鼓浪屿", "曾厝垵", "南普陀寺", "中山路步行街", "厦门大学",
        "环岛路", "集美鳌园",
    ],
    "丽江": ["丽江古城", "玉龙雪山", "束河古镇", "泸沽湖", "虎跳峡", "蓝月谷"],
    "大理": ["洱海", "大理古城", "苍山", "双廊", "喜洲古镇", "崇圣寺三塔"],
    "三亚": ["亚龙湾", "天涯海角", "蜈支洲岛", "大东海", "南山寺", "椰梦长廊"],
    "武汉": ["黄鹤楼", "东湖", "户部巷", "武汉大学", "长江大桥", "湖北省博物馆", "汉口江滩"],
    "长沙": ["橘子洲", "岳麓山", "岳麓书院", "太平街", "湖南省博物馆", "橘子洲头"],
    "青岛": ["栈桥", "八大关", "崂山", "五四广场", "啤酒博物馆", "金沙滩", "信号山"],
    "桂林": ["漓江", "象鼻山", "阳朔西街", "遇龙河", "两江四湖", "龙脊梯田", "银子岩"],
    "阳朔": ["西街", "遇龙河", "十里画廊", "银子岩", "兴坪古镇", "漓江竹筏"],
    "昆明": ["滇池", "石林", "翠湖公园", "云南民族村", "西山", "斗南花市"],
    "拉萨": ["布达拉宫", "大昭寺", "八廓街", "纳木错", "罗布林卡", "哲蚌寺"],
    "哈尔滨": ["中央大街", "圣索菲亚教堂", "冰雪大世界", "太阳岛", "防洪纪念塔"],
    "天津": ["天津之眼", "古文化街", "五大道", "意式风情区", "瓷房子", "海河"],
    "郑州": ["少林寺", "黄河风景名胜区", "二七纪念塔", "河南博物院", "嵩山"],
    "洛阳": ["龙门石窟", "白马寺", "老君山", "应天门", "洛阳博物馆", "丽景门"],
    "敦煌": ["莫高窟", "鸣沙山月牙泉", "阳关", "玉门关", "敦煌夜市"],
    "张家界": ["张家界国家森林公园", "天门山", "大峡谷玻璃桥", "黄龙洞", "天子山"],
    "黄山": ["黄山风景区", "宏村", "西递", "屯溪老街", "齐云山"],
    "无锡": ["鼋头渚", "灵山胜境", "惠山古镇", "南长街", "蠡园"],
    "宁波": ["天一阁", "老外滩", "东钱湖", "溪口", "南塘老街"],
    "福州": ["三坊七巷", "鼓山", "西湖公园", "福州国家森林公园", "烟台山"],
    "泉州": ["开元寺", "清源山", "西街", "洛阳桥", "崇武古城"],
    "贵阳": ["甲秀楼", "青岩古镇", "黔灵山", "花溪公园", "天河潭"],
    "南宁": ["青秀山", "南宁动物园", "中山路", "扬美古镇", "大明山"],
    "海口": ["骑楼老街", "假日海滩", "海南博物馆", "火山口公园", "钟楼"],
    "乌鲁木齐": ["国际大巴扎", "红山公园", "天山天池", "新疆博物馆", "南山牧场"],
    "西宁": ["塔尔寺", "青海湖", "东关清真大寺", "董家巷", "南山公园"],
    "银川": ["镇北堡西部影城", "沙湖", "西夏王陵", "承天寺塔", "水洞沟"],
    "呼和浩特": ["大召寺", "内蒙古博物院", "昭君墓", "希拉穆仁草原", "塞上老街"],
    "沈阳": ["沈阳故宫", "北陵公园", "中街", "张氏帅府", "棋盘山"],
    "大连": ["星海广场", "老虎滩", "金石滩", "俄罗斯风情街", "滨海路"],
    "长春": ["伪满皇宫", "净月潭", "长影世纪城", "南湖公园", "文化广场"],
    "济南": ["趵突泉", "大明湖", "千佛山", "芙蓉街", "曲水亭街", "宽厚里"],
    "太原": ["晋祠", "汾河公园", "双塔寺", "山西省博物院", "柳巷"],
    "合肥": ["包公园", "三河古镇", "李鸿章故居", "巢湖", "淮河路步行街"],
    "南昌": ["滕王阁", "八一起义纪念馆", "秋水广场", "梅岭", "绳金塔"],
    "兰州": ["黄河铁桥", "白塔山", "中山桥", "甘肃省博物馆", "五泉山"],
    "嘉兴": ["乌镇", "西塘", "南湖", "月河历史街区", "南北湖"],
    "绍兴": ["鲁迅故里", "沈园", "东湖", "兰亭", "安昌古镇"],
    "扬州": ["瘦西湖", "个园", "东关街", "何园", "大明寺"],
    "镇江": ["金山寺", "西津渡", "北固山", "焦山", "南山风景区"],
    "珠海": ["长隆海洋王国", "情侣路", "圆明新园", "石景山", "外伶仃岛"],
    "佛山": ["祖庙", "岭南天地", "西樵山", "南风古灶", "千灯湖"],
    "东莞": ["鸦片战争博物馆", "可园", "松山湖", "南社村", "隐贤山庄"],
    "汕头": ["小公园", "南澳岛", "中山公园", "老妈宫", "礐石风景区"],
    "潮州": ["广济桥", "牌坊街", "开元寺", "韩文公祠", "西湖"],
    "开封": ["清明上河园", "开封府", "龙亭", "铁塔", "鼓楼夜市"],
    "承德": ["避暑山庄", "普宁寺", "外八庙", "金山岭长城", "双塔山"],
    "秦皇岛": ["山海关", "北戴河", "老龙头", "鸽子窝", "阿那亚"],
    "威海": ["刘公岛", "成山头", "火炬八街", "国际海水浴场", "威海公园"],
    "烟台": ["蓬莱阁", "长岛", "烟台山", "朝阳街", "养马岛"],
    "泰安": ["泰山", "岱庙", "红门", "天外村", "桃花峪"],
    "曲阜": ["孔庙", "孔府", "孔林", "尼山", "周公庙"],
    "凤凰": ["凤凰古城", "沱江", "南华山", "奇梁洞", "虹桥"],
    "西双版纳": ["望天树", "傣族园", "曼听公园", "中科院植物园", "野象谷"],
    "香格里拉": ["普达措", "独克宗古城", "松赞林寺", "虎跳峡", "梅里雪山"],
    "九寨沟": ["九寨沟风景区", "黄龙", "诺日朗瀑布", "五花海", "熊猫海"],
    "稻城": ["亚丁", "稻城古城", "冲古寺", "洛绒牛场", "牛奶海"],
    "腾冲": ["和顺古镇", "热海", "火山地质公园", "北海湿地", "国殇墓园"],
    "北海": ["银滩", "涠洲岛", "老街", "海底世界", "侨港"],
    "香港": ["维多利亚港", "太平山顶", "迪士尼乐园", "星光大道", "旺角", "大屿山"],
    "澳门": ["大三巴牌坊", "威尼斯人", "议事亭前地", "妈阁庙", "官也街"],
    "台湾": ["台北101", "日月潭", "阿里山", "九份", "垦丁", "故宫博物院"],
    "台北": ["台北101", "士林夜市", "阳明山", "故宫博物院", "西门町"],
}

# 名称含这些则视为微点/附属点，降权或剔除
MICRO_POI_MARKERS = (
    "打卡点",
    "打卡地",
    "出入口",
    "入口",
    "出口",
    "停车场",
    "售票处",
    "售票厅",
    "检票口",
    "洗手间",
    "卫生间",
    "游客中心",
    "服务中心",
    "公交站",
    "地铁站",
    "安检",
    "闸机",
    "北门",
    "南门",
    "东门",
    "西门",
    "侧门",
    "正门",
    "售卖处",
    "纪念品",
)

_CACHE_PATH = Path(__file__).resolve().parents[2] / "data" / "landmark_cache.json"
_mem_cache: dict[str, list[str]] = {}
_cache_lock = threading.Lock()
_disk_loaded = False


def _normalize_city_key(destination: str) -> str:
    dest = (destination or "").strip()
    for suffix in ("市", "地区", "盟", "自治州", "特别行政区"):
        if dest.endswith(suffix) and len(dest) > len(suffix):
            dest = dest[: -len(suffix)]
            break
    return dest


def landmarks_for(destination: str) -> list[str]:
    """按目的地匹配本地精选热门景点。"""
    dest = (destination or "").strip()
    if not dest:
        return []
    for city, names in LANDMARKS.items():
        if city in dest or dest in city:
            return list(names)
    key = _normalize_city_key(dest)
    if key != dest:
        for city, names in LANDMARKS.items():
            if city in key or key in city:
                return list(names)
    return []


def is_micro_poi(name: str) -> bool:
    """是否为景点附属微点（不宜作为主行程）。"""
    n = name or ""
    if any(m in n for m in MICRO_POI_MARKERS):
        return True
    if "-(打卡" in n or "（打卡" in n or "(打卡" in n:
        return True
    if "-" in n and any(x in n for x in ("晚霞", "拱窗", "栏杆", "角楼", "台阶", "桥头")):
        return True
    return False


def landmark_boost(name: str, landmarks: list[str]) -> int:
    """名称命中热门榜时的加分（越大越靠前）。"""
    n = name or ""
    for i, lm in enumerate(landmarks):
        if lm in n or n in lm:
            return 1000 - i * 10
    return 0


def _load_disk_cache() -> None:
    global _disk_loaded
    if _disk_loaded:
        return
    with _cache_lock:
        if _disk_loaded:
            return
        try:
            if _CACHE_PATH.exists():
                data = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    for k, v in data.items():
                        if isinstance(v, list) and v:
                            _mem_cache[str(k)] = [str(x) for x in v if x]
        except Exception as e:
            logger.warning("读取景点缓存失败: %s", e)
        _disk_loaded = True


def _save_disk_cache() -> None:
    try:
        _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _cache_lock:
            payload = dict(_mem_cache)
        _CACHE_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning("写入景点缓存失败: %s", e)


def fetch_landmarks_via_amap(
    city: str,
    amap: AmapClient,
    *,
    limit: int = 12,
) -> list[str]:
    """用高德拉取某城风景名胜/热门景点名称。"""
    from app.services.amap_client import AmapError, POI_TYPES

    city = _normalize_city_key(city) or city.strip()
    if not city:
        return []

    scored: list[tuple[float, str]] = []
    seen: set[str] = set()

    queries: list[tuple[str, str | None]] = [
        ("风景名胜", POI_TYPES.get("attraction")),
        ("旅游景点", POI_TYPES.get("attraction")),
        (f"{city}必去", None),
    ]
    for keyword, poi_type in queries:
        try:
            pois = amap.search_poi_by_keyword(
                keyword,
                city=city,
                limit=20,
                city_limit=True,
                poi_type=poi_type,
            )
        except AmapError as e:
            logger.warning("高德景点检索失败 %s/%s: %s", city, keyword, e)
            continue
        for p in pois:
            name = (p.name or "").strip()
            if not name or is_micro_poi(name):
                continue
            # 去掉过长附属名
            if len(name) > 24:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            scored.append((float(p.rating or 0), name))

    scored.sort(key=lambda x: (-x[0], x[1]))
    return [n for _, n in scored[:limit]]


def resolve_landmarks(
    destination: str,
    amap: AmapClient | None = None,
    *,
    limit: int = 12,
    allow_amap: bool = True,
) -> list[str]:
    """本地精选优先；没有则高德检索（带缓存）。"""
    local = landmarks_for(destination)
    if local:
        return local[:limit]

    city = _normalize_city_key(destination)
    if not city:
        return []

    _load_disk_cache()
    cached = _mem_cache.get(city)
    if cached:
        return list(cached)[:limit]

    if not allow_amap or amap is None:
        return []

    names = fetch_landmarks_via_amap(city, amap, limit=limit)
    if names:
        with _cache_lock:
            _mem_cache[city] = names
        _save_disk_cache()
        logger.info("高德补全热门景点 %s: %s", city, "、".join(names[:6]))
    return names[:limit]
