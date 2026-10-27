package com.travelguide.app.data.util

import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.model.PoiSearchResult

enum class TripMapCategory(val label: String, val icon: String, val color: Long, val search: String) {
    ATTRACTION("景点", "🌳", 0xFF4CAF50, "景点"),
    FOOD("美食", "🍴", 0xFFFFC107, "美食"),
    DRINK("饮品", "🥤", 0xFFFF9800, "咖啡"),
    SHOPPING("购物", "🛍", 0xFFE91E63, "购物"),
    HOTEL("住宿", "🏨", 0xFF2196F3, "酒店"),
}

typealias MapCategoryFilter = TripMapCategory?

private val DRINK_RE = Regex("咖啡|奶茶|茶室|茶馆|酒吧|饮品|果汁|酒馆|cocktail|tea|coffee|清吧|柠檬茶", RegexOption.IGNORE_CASE)
private val SHOP_RE = Regex("购物|商场|百货|免税|市集|奥特莱斯|商业街|mall", RegexOption.IGNORE_CASE)

fun itemMatchesCategory(item: Item, category: TripMapCategory): Boolean {
    val text = "${item.name} ${item.description.orEmpty()}"
    return when (category) {
        TripMapCategory.ATTRACTION -> item.type == "attraction"
        TripMapCategory.HOTEL -> item.type == "hotel"
        TripMapCategory.FOOD -> item.type == "meal" && !DRINK_RE.containsMatchIn(text)
        TripMapCategory.DRINK -> item.type == "meal" && DRINK_RE.containsMatchIn(text)
        TripMapCategory.SHOPPING -> SHOP_RE.containsMatchIn(text)
    }
}

fun tripCategoryMarkers(items: List<Item>, category: TripMapCategory): List<RouteMapMarker> =
    items
        .filter { it.location != null && itemMatchesCategory(it, category) }
        .map { item ->
            val loc = item.location!!
            RouteMapMarker(
                lng = loc.lng,
                lat = loc.lat,
                name = item.name,
                itemId = item.id,
                icon = category.icon,
                isRoute = false,
            )
        }

suspend fun fetchCategoryMarkers(
    category: TripMapCategory,
    destination: String,
    tripItems: List<Item>,
): List<RouteMapMarker> {
    val fromTrip = tripCategoryMarkers(tripItems, category)
    if (destination.isBlank()) return fromTrip
    val pois = runCatching {
        ApiClient.trips.searchPois(category.search, destination, limit = 20)
    }.getOrDefault(emptyList())
    val fromSearch = pois.mapNotNull { poiToMarker(it, category) }
    if (fromSearch.isEmpty()) return fromTrip
    val keys = fromTrip.map { "${it.name}::${it.lng},${it.lat}" }.toSet()
    return fromTrip + fromSearch.filter { "${it.name}::${it.lng},${it.lat}" !in keys }
}

private fun poiToMarker(poi: PoiSearchResult, category: TripMapCategory): RouteMapMarker? {
    val loc = poi.location ?: return null
    return RouteMapMarker(
        lng = loc.lng,
        lat = loc.lat,
        name = poi.name,
        itemId = null,
        icon = category.icon,
        isRoute = false,
    )
}
