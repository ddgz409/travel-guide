package com.travelguide.app.data.model

/**
 * 热门城市快捷入口（探索页、管理城市空态），非完整词表。
 */
val CITY_CATALOG: List<String> = listOf(
    // 常见旅游城市
    "北京", "上海", "广州", "深圳", "杭州", "成都", "西安", "南京", "苏州", "重庆",
    "武汉", "长沙", "厦门", "青岛", "大连", "三亚", "丽江", "拉萨", "昆明", "贵阳",
    "哈尔滨", "沈阳", "天津", "济南", "郑州", "合肥", "南昌", "福州", "南宁", "海口",
    "宁波", "无锡", "常州", "温州", "珠海", "桂林", "敦煌", "洛阳", "开封", "扬州",
    "威海", "烟台", "秦皇岛", "北戴河", "大理", "香格里拉", "九寨沟", "张家界", "黄山",
    "澳门", "香港", "台北", "乌鲁木齐", "呼和浩特", "银川", "西宁", "兰州", "太原",
    "石家庄", "长春", "顺德", "佛山", "东莞", "惠州", "绍兴", "嘉兴", "湖州", "泉州",
    "漳州", "湛江", "北海", "腾冲", "景德镇", "婺源", "莫干山", "千岛湖", "普陀山",
    // 环线站点（不在地级 CITIES 表内的别名）
    "茶卡", "大柴旦", "张掖", "祁连", "夏河", "扎尕那", "郎木寺", "玛曲", "若尔盖",
    "康定", "新都桥", "稻城", "亚丁", "塔尔寺", "青海湖", "嘉峪关", "吐鲁番", "喀纳斯",
    "禾木", "赛里木湖", "伊宁", "泸沽湖", "额济纳", "文昌", "琼海", "万宁", "陵水",
    "东方", "儋州", "临高", "乐东", "保亭", "五指山", "澄迈", "屯昌", "定安", "琼中",
    "白沙", "昌江", "德令哈",
)

private val CITY_NAME_SET: Set<String> by lazy { CITIES.map { it.name }.toSet() }

/** 热门表中有、但地级 CITIES 里没有的环线/景区别名 */
private val EXTRA_CITY_ALIASES: List<String> by lazy {
    CITY_CATALOG.filter { it !in CITY_NAME_SET }
}

/**
 * 城市联想：全国地级行政区（CITIES）+ 环线别名，对齐 RN citiesGrouped / matchCityCandidates。
 */
fun matchCities(query: String, limit: Int = 12): List<String> {
    val q = query.trim()
    if (q.isEmpty()) return emptyList()
    val qLower = q.lowercase()

    data class Scored(val name: String, val score: Int)
    val scored = mutableListOf<Scored>()

    for (entry in CITIES) {
        val name = entry.name
        when {
            name == q -> scored.add(Scored(name, 0))
            name.startsWith(q) -> scored.add(Scored(name, 1 + name.length))
            q.length >= 2 && name.contains(q) -> scored.add(Scored(name, 10 + name.length))
            entry.letter.equals(q, ignoreCase = true) -> scored.add(Scored(name, 15))
            name.lowercase().startsWith(qLower) -> scored.add(Scored(name, 8 + name.length))
        }
    }

    for (alias in EXTRA_CITY_ALIASES) {
        when {
            alias == q -> scored.add(Scored(alias, 0))
            alias.startsWith(q) -> scored.add(Scored(alias, 2 + alias.length))
            q.length >= 2 && alias.contains(q) -> scored.add(Scored(alias, 11 + alias.length))
        }
    }

    return scored
        .sortedWith(compareBy({ it.score }, { it.name.length }))
        .map { it.name }
        .distinct()
        .take(limit)
}

/** 目的地热门景点本地精选（对齐 RN data/landmarks.ts，完整列表由后端高德补全） */
val LANDMARKS: Map<String, List<String>> = mapOf(
    "北京" to listOf(
        "故宫博物院", "天安门广场", "八达岭长城", "颐和园", "天坛公园",
        "景山公园", "北海公园", "南锣鼓巷", "什刹海", "雍和宫",
    ),
    "上海" to listOf(
        "外滩", "东方明珠", "豫园", "南京路步行街", "田子坊",
        "上海迪士尼乐园", "陆家嘴", "武康路",
    ),
    "杭州" to listOf("西湖", "灵隐寺", "西溪湿地", "河坊街", "雷峰塔", "断桥", "龙井村", "千岛湖"),
    "成都" to listOf(
        "宽窄巷子", "锦里古街", "大熊猫繁育研究基地", "武侯祠",
        "杜甫草堂", "春熙路", "太古里", "都江堰",
    ),
    "西安" to listOf(
        "兵马俑", "大雁塔", "西安城墙", "回民街", "钟楼",
        "大唐不夜城", "华清宫", "陕西历史博物馆",
    ),
    "广州" to listOf("广州塔", "陈家祠", "沙面", "永庆坊", "白云山", "长隆旅游度假区"),
    "深圳" to listOf("世界之窗", "欢乐谷", "大梅沙", "莲花山公园", "深圳湾公园"),
    "南京" to listOf("中山陵", "夫子庙", "玄武湖", "总统府", "明孝陵", "秦淮河"),
    "重庆" to listOf("洪崖洞", "解放碑", "磁器口古镇", "长江索道", "朝天门", "李子坝轻轨站"),
    "苏州" to listOf("拙政园", "虎丘", "平江路", "留园", "寒山寺", "周庄古镇"),
    "厦门" to listOf("鼓浪屿", "曾厝垵", "南普陀寺", "中山路步行街", "厦门大学", "环岛路"),
    "丽江" to listOf("丽江古城", "玉龙雪山", "束河古镇", "泸沽湖", "虎跳峡"),
    "大理" to listOf("洱海", "大理古城", "苍山", "双廊", "喜洲古镇", "崇圣寺三塔"),
    "三亚" to listOf("亚龙湾", "天涯海角", "蜈支洲岛", "大东海", "南山寺", "椰梦长廊"),
    "武汉" to listOf("黄鹤楼", "东湖", "户部巷", "武汉大学", "长江大桥"),
    "长沙" to listOf("橘子洲", "岳麓山", "岳麓书院", "太平街", "湖南省博物馆"),
    "青岛" to listOf("栈桥", "八大关", "崂山", "五四广场", "啤酒博物馆"),
    "桂林" to listOf("漓江", "象鼻山", "阳朔西街", "遇龙河", "两江四湖"),
    "昆明" to listOf("滇池", "石林", "翠湖公园", "云南民族村", "西山"),
    "拉萨" to listOf("布达拉宫", "大昭寺", "八廓街", "纳木错", "罗布林卡"),
    "哈尔滨" to listOf("中央大街", "圣索菲亚教堂", "冰雪大世界", "太阳岛"),
    "天津" to listOf("天津之眼", "古文化街", "五大道", "意式风情区"),
    "张家界" to listOf("张家界国家森林公园", "天门山", "大峡谷玻璃桥", "黄龙洞"),
    "黄山" to listOf("黄山风景区", "宏村", "西递", "屯溪老街"),
    "敦煌" to listOf("莫高窟", "鸣沙山月牙泉", "阳关", "玉门关"),
    "香港" to listOf("维多利亚港", "太平山顶", "迪士尼乐园", "星光大道"),
    "澳门" to listOf("大三巴牌坊", "威尼斯人", "议事亭前地", "妈阁庙"),
)

/** 取目的地地标列表（双向包含匹配，对齐 RN landmarksFor） */
fun landmarksFor(destination: String): List<String> {
    val dest = destination.trim()
    if (dest.isEmpty()) return emptyList()
    for ((city, names) in LANDMARKS) {
        if (dest.contains(city) || city.contains(dest)) return names
    }
    return emptyList()
}
