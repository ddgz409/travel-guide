package com.travelguide.app.data.util

import com.travelguide.app.data.model.Day
import com.travelguide.app.data.model.Location

/** 常见城市中心（lng, lat），含青甘环线沿途 */
private val CITY_CENTERS = mapOf(
    "北京" to (116.4074 to 39.9042),
    "上海" to (121.4737 to 31.2304),
    "杭州" to (120.1551 to 30.2741),
    "成都" to (104.0665 to 30.5723),
    "西安" to (108.9398 to 34.3416),
    "厦门" to (118.0894 to 24.4798),
    "三亚" to (109.5083 to 18.2479),
    "大理" to (100.2257 to 25.5894),
    "拉萨" to (91.1322 to 29.6604),
    "西宁" to (101.778 to 36.617),
    "德令哈" to (97.371 to 37.369),
    "敦煌" to (94.662 to 40.142),
    "张掖" to (100.455 to 38.925),
    "茶卡" to (99.078 to 36.791),
    "大柴旦" to (95.357 to 37.853),
    "祁连" to (100.176 to 38.182),
    "格尔木" to (94.903 to 36.402),
    "嘉峪关" to (98.289 to 39.773),
    "广州" to (113.2644 to 23.1291),
    "深圳" to (114.0579 to 22.5431),
    "南京" to (118.7969 to 32.0603),
    "苏州" to (120.5853 to 31.299),
    "重庆" to (106.5516 to 29.563),
    "武汉" to (114.3055 to 30.5928),
    "长沙" to (112.9388 to 28.2282),
    "青岛" to (120.3826 to 36.0671),
    "大连" to (121.6147 to 38.914),
    "丽江" to (100.233 to 26.8721),
    "昆明" to (102.8329 to 24.8801),
    "桂林" to (110.299 to 25.2742),
    "哈尔滨" to (126.535 to 45.8038),
    "呼伦贝尔" to (119.7658 to 49.2116),
    "海拉尔" to (119.7658 to 49.2116),
    "海拉尔区" to (119.7658 to 49.2116),
)

/** 环线/路线名不能作为 POI 搜索 city（如「青甘环线」会搜全国） */
fun isRouteDestination(name: String): Boolean {
    val n = name.trim()
    if (n.isEmpty()) return false
    return n.contains("环线") || n.contains("大环线") || n.contains("自驾线") || n.contains("路线")
}

/** POI 搜索用城市：优先当天 city，跳过环线名 */
fun resolvePoiSearchCity(dayCity: String?, tripDestination: String): String {
    dayCity?.trim()?.takeIf { it.isNotBlank() && !isRouteDestination(it) }
        ?.let { return it.replace("市", "") }
    tripDestination.trim().takeIf { it.isNotBlank() && !isRouteDestination(it) }
        ?.let { return it.replace("市", "") }
    return ""
}

fun cityCenterFor(name: String): Pair<Double, Double>? {
    val dest = name.trim().replace("市", "")
    if (dest.isEmpty()) return null
    CITY_CENTERS[dest]?.let { return it }
    for ((key, center) in CITY_CENTERS) {
        if (dest.contains(key) || key.contains(dest)) return center
    }
    return null
}

/** 添加地点时的坐标锚点：地图选点 > 当天已有 POI > 当天城市中心 */
fun resolveDayAnchor(day: Day?, picked: Location?): Location? {
    picked?.let { return it }
    day?.items?.firstNotNullOfOrNull { it.location }?.let { return it }
    val city = day?.city?.trim().orEmpty()
    if (city.isBlank() || isRouteDestination(city)) return null
    val center = cityCenterFor(city) ?: return null
    return Location(lng = center.first, lat = center.second, address = city)
}
