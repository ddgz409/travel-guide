package com.travelguide.app.data.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.travelguide.app.data.api.CityInfo
import com.travelguide.app.data.api.CitySpotDto
import com.travelguide.app.data.model.landmarksFor
import java.net.URLEncoder
import kotlin.math.cos
import kotlin.math.sin

data class CityExploreCategory(
    val key: String,
    val label: String,
    val icon: String,
    val colorArgb: Int,
)

val CITY_EXPLORE_CATEGORIES = listOf(
    CityExploreCategory("spots", "景点", "🌳", 0xFF4CAF50.toInt()),
    CityExploreCategory("foods", "美食", "🍴", 0xFFFFC107.toInt()),
)

private val CITY_COORDS = mapOf(
    "北京" to (116.407 to 39.904),
    "成都" to (104.066 to 30.572),
    "杭州" to (120.155 to 30.274),
    "大理" to (100.226 to 25.605),
    "西安" to (108.94 to 34.341),
    "厦门" to (118.089 to 24.479),
    "上海" to (121.473 to 31.23),
    "三亚" to (109.508 to 18.247),
)

private val LOCAL_FOODS = mapOf(
    "北京" to listOf("北京烤鸭", "炸酱面", "涮羊肉"),
    "上海" to listOf("小笼包", "生煎", "本帮菜"),
    "成都" to listOf("火锅", "龙抄手", "担担面"),
    "杭州" to listOf("西湖醋鱼", "东坡肉", "片儿川"),
    "西安" to listOf("肉夹馍", "羊肉泡馍", "凉皮"),
    "厦门" to listOf("沙茶面", "土笋冻", "海蛎煎"),
    "三亚" to listOf("海鲜", "清补凉", "椰子鸡"),
    "大理" to listOf("乳扇", "饵丝", "酸辣鱼"),
)

fun cityCoord(city: String): Pair<Double, Double> {
    val c = city.trim()
    for ((name, coord) in CITY_COORDS) {
        if (c.contains(name) || name.contains(c)) return coord
    }
    return 116.407 to 39.904
}

/** 本地精选：热门城市秒开预览（对齐 RN buildLocalCityPreview） */
fun buildLocalCityPreview(city: String): CityInfo? {
    val c = city.trim()
    if (c.isEmpty()) return null
    val spotNames = landmarksFor(c).take(4)
    if (spotNames.isEmpty()) return null
    var foodNames = emptyList<String>()
    for ((key, names) in LOCAL_FOODS) {
        if (c.contains(key) || key.contains(c)) {
            foodNames = names
            break
        }
    }
    if (foodNames.isEmpty()) foodNames = listOf("当地特色菜", "网红小吃", "老字号")
    return CityInfo(
        city = c,
        spots = spotNames.map { CitySpotDto(name = it, desc = "${c}热门必去") },
        foods = foodNames.take(3).map { CitySpotDto(name = it, desc = "本地特色美食") },
    )
}

fun itemCoord(base: Pair<Double, Double>, name: String, index: Int): Pair<Double, Double> {
    val hash = name.sumOf { it.code }
    val angle = ((hash + index * 37) % 360) * (Math.PI / 180)
    val dist = 0.015 + (hash % 8) * 0.004
    return base.first + cos(angle) * dist to base.second + sin(angle) * dist * 0.75
}

fun fakePopularity(name: String): String {
    val hash = name.sumOf { it.code }
    val n = ((hash % 890) + 110) / 100.0
    return "%.2f万人规划".format(n)
}

fun cityIntro(city: String, spotDescs: List<String>): String {
    val hint = spotDescs.firstOrNull()?.take(60) ?: "这里有独特的风土人情等待探索"
    return "$city，$hint。根据用户真实出行数据，为你精选以下热门目的地。"
}

fun xhsCategoryKeyword(city: String, categoryKey: String): String {
    val dest = city.trim().ifEmpty { "旅游" }
    return when (categoryKey) {
        "foods" -> "$dest 美食推荐"
        "hotels" -> "$dest 住宿推荐"
        "humanities" -> "$dest 人文打卡"
        else -> "$dest 必去景点"
    }
}

fun openXiaohongshuSearch(context: Context, keyword: String) {
    val enc = URLEncoder.encode(keyword.trim(), "UTF-8")
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.xiaohongshu.com/search_result?keyword=$enc")),
        )
    }
}

data class CityPoiMarker(
    val item: CitySpotDto,
    val lng: Double,
    val lat: Double,
    val icon: String,
)

fun buildCityPoiMarkers(
    items: List<CitySpotDto>,
    category: CityExploreCategory,
    baseCoord: Pair<Double, Double>,
): List<CityPoiMarker> =
    items.mapIndexed { i, item ->
        val coord = if (item.lng != null && item.lat != null) {
            item.lng to item.lat
        } else {
            itemCoord(baseCoord, item.name, i)
        }
        CityPoiMarker(item, coord.first, coord.second, category.icon)
    }
