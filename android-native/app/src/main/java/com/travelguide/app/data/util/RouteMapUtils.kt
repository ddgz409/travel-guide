package com.travelguide.app.data.util

import com.travelguide.app.data.api.DayRouteSegment
import com.travelguide.app.data.model.Item

/** 地图标记（对齐 RN amapHtml MapMarker 子集） */
data class RouteMapMarker(
    val lng: Double,
    val lat: Double,
    val name: String,
    val itemId: String? = null,
    val icon: String? = null,
    val isRoute: Boolean = true,
)

/**
 * 相邻两站之间只认真实路线折线；缺数据的段保持断开（对齐 RN polylinesFromItems）。
 * polyline 点格式：[lng, lat]
 */
/** 攻略交通偏好 → getDayRoutes 请求模式（对齐 RN routeModeForTransport） */
fun routeModeForTransport(transport: String?): String = when (transport?.trim()) {
    "自驾" -> "driving"
    "步行" -> "walking"
    else -> "transit"
}

/** 从 map-routes 响应段提取可绘制折线（跳过 direct 直线兜底） */
fun polylinesFromDayRoutes(segments: List<DayRouteSegment>): List<List<List<Double>>> =
    segments
        .filter { it.mode != "direct" && it.polyline.size >= 2 }
        .map { it.polyline }

fun polylinesFromItems(source: List<Item>): List<List<List<Double>>> {
    val groups = mutableListOf<List<List<Double>>>()
    var cur = mutableListOf<List<Double>>()
    for (i in 0 until source.lastIndex) {
        val poly = source[i].transportToNext?.polyline
        if (!poly.isNullOrEmpty() && poly.size >= 2) {
            if (cur.isEmpty()) {
                cur.addAll(poly)
            } else {
                cur.addAll(poly.drop(1))
            }
            continue
        }
        if (cur.size >= 2) groups.add(cur.toList())
        cur = mutableListOf()
    }
    if (cur.size >= 2) groups.add(cur.toList())
    return groups
}

fun polylinesFromTripDays(days: List<com.travelguide.app.data.model.Day>): List<List<List<Double>>> =
    days.flatMap { day ->
        polylinesFromItems(day.items.filter { it.selected && it.location != null })
    }

fun routeItemMarkers(items: List<Item>): List<RouteMapMarker> =
    items
        .filter { it.selected && it.location != null }
        .mapIndexed { index, item ->
            val loc = item.location!!
            RouteMapMarker(
                lng = loc.lng,
                lat = loc.lat,
                name = item.name,
                itemId = item.id,
                icon = "${index + 1}",
                isRoute = true,
            )
        }

fun resolveTripItemId(items: List<Item>, name: String, lng: Double, lat: Double, itemId: String?): String? {
    if (!itemId.isNullOrBlank()) return itemId
    val norm = { s: String -> s.trim().lowercase() }
    val n = norm(name)
    items.find { norm(it.name) == n }?.id?.let { return it }
    items.find { norm(it.name).contains(n) || n.contains(norm(it.name)) }?.id?.let { return it }
    val eps = 0.0008
    return items.find {
        val loc = it.location ?: return@find false
        kotlin.math.abs(loc.lng - lng) < eps && kotlin.math.abs(loc.lat - lat) < eps
    }?.id
}
