package com.travelguide.app.data.util

import com.travelguide.app.data.model.CITIES
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/** 客户端行程规划意图识别（对齐 RN utils/chatIntent.ts） */

data class PlanNavigateAction(
    val action: String = "navigate_generate",
    val destination: String,
    val startDate: String,
    val endDate: String,
    val interests: List<String> = listOf("文化", "美食"),
    val mode: String = "custom",
    val autoSubmit: Boolean = true,
    val chatHint: String,
    val travelers: Int? = null,
    val transport: String? = null,
    val route: List<String>? = null,
)

data class SmartPlanDraft(
    val keywords: String,
    val destination: String,
    val days: Int,
    val startDate: String,
    val endDate: String,
    val expandedQuery: String = "",
    val action: PlanNavigateAction,
)

data class SmartPlanSuggestion(
    val smartPlan: SmartPlanDraft? = null,
    val incompletePlan: SmartPlanDraft? = null,
    val cities: List<String> = emptyList(),
    val unknownInput: Boolean = false,
)

private val MAJOR_CITIES = listOf(
    "呼和浩特", "乌鲁木齐", "哈尔滨", "石家庄", "连云港", "张家界",
    "香格里拉", "九寨沟", "香港", "澳门", "台北",
    "北京", "上海", "广州", "深圳", "杭州", "成都", "西安", "南京", "苏州",
    "重庆", "武汉", "长沙", "厦门", "青岛", "大连", "三亚", "丽江", "拉萨",
    "昆明", "贵阳", "南宁", "海口", "福州", "济南", "郑州", "合肥", "南昌",
    "太原", "沈阳", "长春", "宁波", "无锡", "常州", "温州", "珠海", "桂林",
    "敦煌", "洛阳", "开封", "扬州", "威海", "烟台", "秦皇岛", "北戴河",
    "淮安", "徐州", "盐城", "泰州", "镇江", "宿迁", "顺德", "佛山", "东莞",
)

private val PROVINCES = listOf(
    "山东", "云南", "四川", "湖南", "福建", "江西", "安徽", "贵州", "广西",
    "河南", "湖北", "陕西", "山西", "河北", "辽宁", "吉林", "黑龙江",
    "江苏", "浙江", "广东", "甘肃", "新疆", "西藏", "内蒙古", "宁夏", "青海",
    "海南", "台湾",
)

private val KNOWN_CITY_SET: Set<String> = buildSet {
    MAJOR_CITIES.forEach { add(normalizeCity(it)) }
    PROVINCES.forEach { add(it) }
    CITIES.forEach { add(normalizeCity(it.name)) }
}

private val PLAN_RE = Regex(
    """(?:规划|安排|制定|设计|生成).*(?:行程|攻略|旅行计划|旅游计划|路线|环线|环岛)|(?:帮我|请).*(?:规划|安排|制定|设计|生成).*(?:行程|攻略|旅行|旅游)?|(?:一|两|三|四|五|六|七|八|九|\d+)\s*日游""",
    RegexOption.IGNORE_CASE,
)

private val TRIP_MGMT_RE = Regex(
    """删除|删掉|删了|移除|清除|去掉|取消|不要了|查看|看看|列表|有哪些|我的行程|行程列表|攻略列表|打开|分享|/share/|修改|编辑|更新|帖子|收藏夹|发布|发帖|做成清单|转成清单|改成清单|编辑成清单""",
)

private val NEW_PLAN_RE = Regex("""(?:规划|安排|制定|设计|生成)(?:一个|一份|新的)?(?:行程|攻略)""")

private val INTEREST_MAP = listOf(
    "美食" to "美食", "吃货" to "美食", "穿衣" to "购物", "搭配" to "购物",
    "亲子" to "亲子", "拍照" to "摄影", "摄影" to "摄影", "博物馆" to "历史",
    "历史" to "历史", "自然" to "自然", "户外" to "自然", "购物" to "购物",
    "艺术" to "艺术", "文化" to "文化", "人文" to "文化",
)

private val CN_DAY_MAP = mapOf(
    "一" to 1, "二" to 2, "两" to 2, "三" to 3, "四" to 4,
    "五" to 5, "六" to 6, "七" to 7, "八" to 8, "九" to 9,
)

private fun iso(cal: Calendar): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)

private fun normalizeCity(name: String): String = name
    .replace("市$".toRegex(), "")
    .replace("维吾尔自治区$".toRegex(), "")
    .replace("壮族自治区$".toRegex(), "")
    .replace("回族自治区$".toRegex(), "")
    .replace("自治区$".toRegex(), "")
    .replace("省$".toRegex(), "")
    .trim()

fun isKnownCityName(name: String): Boolean {
    val n = normalizeCity(name)
    return n.length >= 2 && KNOWN_CITY_SET.contains(n)
}

fun hasPlanDuration(text: String): Boolean =
    parseDayCount(text) != null ||
        Regex("""明天|后天|大后天|今天|周末|小长假|规划|行程|攻略|日游""").containsMatchIn(text)

fun parseDayCount(text: String): Int? {
    Regex("""(\d+)\s*天""").find(text)?.groupValues?.get(1)?.toIntOrNull()?.let {
        return it.coerceIn(1, 14)
    }
    Regex("""([一二两三四五六七八九])\s*日游""").find(text)?.groupValues?.get(1)?.let {
        return CN_DAY_MAP[it]
    }
    return null
}

private fun parseDates(text: String): Pair<String, String> {
    val today = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 12) }
    val start = (today.clone() as Calendar)
    when {
        text.contains("大后天") -> start.add(Calendar.DAY_OF_YEAR, 3)
        text.contains("后天") -> start.add(Calendar.DAY_OF_YEAR, 2)
        text.contains("明天") -> start.add(Calendar.DAY_OF_YEAR, 1)
        text.contains("今天") -> {}
        else -> start.add(Calendar.DAY_OF_YEAR, 1)
    }
    val days = parseDayCount(text) ?: 1
    val end = (start.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, days - 1) }
    return iso(start) to iso(end)
}

private fun parseDatesWithDays(text: String, days: Int): Pair<String, String> {
    val today = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 12) }
    val start = (today.clone() as Calendar)
    when {
        text.contains("大后天") -> start.add(Calendar.DAY_OF_YEAR, 3)
        text.contains("后天") -> start.add(Calendar.DAY_OF_YEAR, 2)
        text.contains("明天") -> start.add(Calendar.DAY_OF_YEAR, 1)
        text.contains("今天") -> {}
        else -> start.add(Calendar.DAY_OF_YEAR, 1)
    }
    val end = (start.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, days - 1) }
    return iso(start) to iso(end)
}

private fun defaultDays(text: String): Int {
    parseDayCount(text)?.let { return it }
    if (text.contains("周末") || text.contains("小长假")) return 2
    if (text.contains("明天") || text.contains("后天") || text.contains("今天") || text.contains("大后天")) return 1
    return 2
}

private fun extractInterests(text: String): List<String> {
    val found = mutableListOf<String>()
    for ((kw, tag) in INTEREST_MAP) {
        if (text.contains(kw) && tag !in found) found.add(tag)
    }
    return found.ifEmpty { listOf("文化", "美食") }
}

private fun extractCityFromKeywords(text: String): String? {
    val raw = text.trim()
    if (raw.isEmpty()) return null
    for (city in MAJOR_CITIES.sortedByDescending { it.length }) {
        if (raw.contains(city)) return city
    }
    for (entry in CITIES) {
        val short = normalizeCity(entry.name)
        if (raw.contains(short)) return short
    }
    val exact = normalizeCity(raw)
    if (isKnownCityName(exact)) return exact
    Regex("""^([\u4e00-\u9fff]{2,6})""").find(raw)?.groupValues?.get(1)?.let {
        if (isKnownCityName(it)) return normalizeCity(it)
    }
    return null
}

private fun extractCity(text: String): String? {
    for (city in MAJOR_CITIES.sortedByDescending { it.length }) {
        if (text.contains(city)) return city
    }
    for (entry in CITIES) {
        val short = normalizeCity(entry.name)
        if (text.contains(short)) return short
    }
    Regex("""去([\u4e00-\u9fff]{2,8}?)(?:的|玩|旅游|行)""").find(text)?.groupValues?.get(1)?.let {
        if (isKnownCityName(it)) return normalizeCity(it)
    }
    Regex("""([\u4e00-\u9fff]{2,6})(?:市|城)?(?:的)?(?:行程|攻略|旅游)""").find(text)?.groupValues?.get(1)?.let {
        if (isKnownCityName(it)) return normalizeCity(it)
    }
    Regex("""([\u4e00-\u9fff]{2,10}?)(环线|环岛|大环线)""").find(text)?.let {
        return "${it.groupValues[1]}${it.groupValues[2]}"
    }
    for (p in PROVINCES) {
        if (text.contains(p)) return p
    }
    return null
}

fun matchCityCandidates(query: String, limit: Int = 6): List<String> {
    val q = query.trim()
    if (q.isEmpty()) return emptyList()
    val scored = mutableListOf<Pair<String, Double>>()
    for (entry in CITIES) {
        val short = normalizeCity(entry.name)
        when {
            short == q -> scored.add(short to 0.0)
            short.startsWith(q) -> scored.add(short to 1.0 + (short.length - q.length) * 0.01)
            q.length >= 2 && short.contains(q) -> scored.add(short to 10.0 + short.length)
        }
    }
    for (city in MAJOR_CITIES) {
        when {
            city.startsWith(q) -> scored.add(city to 1.0)
            q.length >= 2 && city.contains(q) -> scored.add(city to 10.0)
        }
    }
    scored.sortWith(compareBy({ it.second }, { it.first.length }))
    val out = mutableListOf<String>()
    val seen = mutableSetOf<String>()
    for ((name, _) in scored) {
        if (seen.add(name)) {
            out.add(name)
            if (out.size >= limit) break
        }
    }
    return out
}

fun buildExpandedQuery(draft: SmartPlanDraft): String {
    val dest = draft.destination
    val days = draft.days
    val raw = draft.keywords
    if (Regex("""规划|行程|攻略""").containsMatchIn(raw) && raw.length > 8) {
        return if (raw.startsWith("帮我")) raw else "帮我$raw"
    }
    val timeHint = Regex("""明天|后天|大后天|今天|周末""").find(raw)?.value
    return if (timeHint != null) {
        "帮我规划${timeHint}去${dest}的${days}日行程，体验当地文化与美食"
    } else {
        "帮我规划${draft.startDate}起${dest}${days}日游，体验当地文化与美食"
    }
}

fun parseSmartPlanKeywords(keywords: String): SmartPlanDraft? {
    val raw = keywords.trim()
    if (raw.length < 2) return null
    val destination = extractCityFromKeywords(raw) ?: return null
    if (!isKnownCityName(destination)) return null
    val days = defaultDays(raw)
    val (start, end) = parseDatesWithDays(raw, days)
    val action = PlanNavigateAction(
        destination = destination,
        startDate = start,
        endDate = end,
        interests = extractInterests(raw),
        chatHint = raw,
    )
    return SmartPlanDraft(raw, destination, days, start, end, "", action)
}

private fun isCompleteSmartPlanQuery(q: String, draft: SmartPlanDraft): Boolean {
    if (!isKnownCityName(draft.destination)) return false
    if (!hasPlanDuration(q)) return false
    val dest = draft.destination
    if (dest.startsWith(q.trim()) && q.trim().length < dest.length) return false
    return true
}

fun searchPlanSuggestions(query: String): SmartPlanSuggestion {
    val q = query.trim()
    if (q.isEmpty()) return SmartPlanSuggestion()
    val parsed = parseSmartPlanKeywords(q)
    val cities = matchCityCandidates(q).filter { it != parsed?.destination }
    if (parsed != null && isCompleteSmartPlanQuery(q, parsed)) {
        return SmartPlanSuggestion(smartPlan = parsed, cities = cities)
    }
    if (parsed != null && isKnownCityName(parsed.destination)) {
        return SmartPlanSuggestion(incompletePlan = parsed, cities = cities)
    }
    val unknownInput = q.length >= 2 && cities.isEmpty() && !Regex("""^\d+$""").matches(q)
    return SmartPlanSuggestion(cities = cities, unknownInput = unknownInput)
}

fun detectPlanIntent(text: String): PlanNavigateAction? {
    val raw = text.trim()
    if (raw.length < 4) return null
    if (TRIP_MGMT_RE.containsMatchIn(raw) && !NEW_PLAN_RE.containsMatchIn(raw)) return null
    if (!PLAN_RE.containsMatchIn(raw)) return null
    val destination = extractCity(raw) ?: return null
    val isKnown = isKnownCityName(destination) ||
        destination in PROVINCES ||
        Regex("""环线|环岛|大环线""").containsMatchIn(destination)
    if (!isKnown) return null
    val (start, end) = parseDates(raw)
    return PlanNavigateAction(
        destination = destination,
        startDate = start,
        endDate = end,
        interests = extractInterests(raw),
        chatHint = raw,
    )
}
