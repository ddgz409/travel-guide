package com.travelguide.app.data.util

import com.travelguide.app.data.local.CheckInRecord
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** 足迹统计（对齐 RN utils/footprintStats.ts） */

enum class ContinentId { NA, SA, EU, AF, AS, OC, AN }

data class FootprintStats(
    val countryCount: Int = 0,
    val cityCount: Int = 0,
    val placeCount: Int = 0,
    val topSeason: String? = null,
    val farthest: CheckInRecord? = null,
    val northernmost: CheckInRecord? = null,
    val southernmost: CheckInRecord? = null,
    val latest: CheckInRecord? = null,
    val continentCount: Int = 0,
    val visitedContinents: List<ContinentId> = emptyList(),
    val topCategory: Pair<String, Int>? = null,
)

private val CAT_LABEL = mapOf("spots" to "景点", "foods" to "吃喝", "humanities" to "人文")

private const val HOME_LNG = 116.4074
private const val HOME_LAT = 39.9042

/** 区划码前两位 → 省名（RN 用 107KB SVG 资源表，原生只需名字） */
private val PROVINCE_LABELS = mapOf(
    "11" to "北京", "12" to "天津", "13" to "河北", "14" to "山西", "15" to "内蒙古",
    "21" to "辽宁", "22" to "吉林", "23" to "黑龙江",
    "31" to "上海", "32" to "江苏", "33" to "浙江", "34" to "安徽", "35" to "福建",
    "36" to "江西", "37" to "山东",
    "41" to "河南", "42" to "湖北", "43" to "湖南", "44" to "广东", "45" to "广西", "46" to "海南",
    "50" to "重庆", "51" to "四川", "52" to "贵州", "53" to "云南", "54" to "西藏",
    "61" to "陕西", "62" to "甘肃", "63" to "青海", "64" to "宁夏", "65" to "新疆",
    "71" to "台湾", "81" to "香港", "82" to "澳门",
)

private fun toRad(d: Double) = d * PI / 180

private fun haversineKm(aLng: Double, aLat: Double, bLng: Double, bLat: Double): Double {
    val r = 6371.0
    val dLat = toRad(bLat - aLat)
    val dLng = toRad(bLng - aLng)
    val s = sin(dLat / 2).pow(2) + cos(toRad(aLat)) * cos(toRad(bLat)) * sin(dLng / 2).pow(2)
    return 2 * r * asin(min(1.0, sqrt(s)))
}

private fun coordOf(item: CheckInRecord): Pair<Double, Double>? = // lng to lat
    if (item.lng != null && item.lat != null) item.lng to item.lat
    else cityCenterFor(item.city)

/** 根据经纬度判断大洲，供点阵地图实时高亮（对齐 RN continentFromLngLat） */
fun continentFromLngLat(lat: Double, lng: Double): ContinentId {
    if (lat <= -60) return ContinentId.AN
    if (lng <= -25 && lng >= -180) {
        if (lat >= 12.5) return ContinentId.NA
        if (lat >= 7 && lng <= -77) return ContinentId.NA
        return ContinentId.SA
    }
    if (lat < -10 && lng >= 110 && lng <= 180) return ContinentId.OC
    if (lat <= 0 && lng >= 130 && lng <= 180) return ContinentId.OC
    if (lng >= -20 && lng <= 52 && lat >= -35 && lat <= 37.5) {
        if (lng < 0 && lat < 36) return ContinentId.AF
        if (lat < 32) return ContinentId.AF
        if (lat < 36 && lng >= 11 && lng <= 51) return ContinentId.AF
    }
    if (lat >= 35 && lat <= 72 && lng >= -25 && lng <= 42) return ContinentId.EU
    return ContinentId.AS
}

private val CN_CHAR = Regex("[\u4e00-\u9fff]")

private fun continentOfRecord(item: CheckInRecord): ContinentId? {
    coordOf(item)?.let { (lng, lat) -> return continentFromLngLat(lat, lng) }
    if (CN_CHAR.containsMatchIn(item.city.ifBlank { item.name })) return ContinentId.AS
    return null
}

private fun parseInstant(iso: String): Instant? =
    runCatching { Instant.parse(iso) }.getOrNull()

private fun seasonOf(iso: String): String {
    val m = parseInstant(iso)?.atZone(ZoneId.systemDefault())?.monthValue ?: return "冬"
    return when (m) {
        in 3..5 -> "春"
        in 6..8 -> "夏"
        in 9..11 -> "秋"
        else -> "冬"
    }
}

private val DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd").withZone(ZoneId.systemDefault())
private val TIME_FMT = DateTimeFormatter.ofPattern("MM/dd HH:mm").withZone(ZoneId.systemDefault())

fun formatCheckDate(iso: String): String =
    parseInstant(iso)?.let { DATE_FMT.format(it) } ?: ""

fun formatCheckTime(iso: String): String =
    parseInstant(iso)?.let { TIME_FMT.format(it) } ?: ""

// ---------- 足迹列表条目 ----------

enum class FootprintListKind { COUNTRY, CITY, PLACE }

data class FootprintListEntry(
    val key: String,
    val title: String,
    val sub: String? = null,
    val province: String? = null,
    val time: String? = null,
)

private fun cityLabel(city: String): String {
    val raw = city.trim()
    if (raw.isEmpty()) return ""
    if (Regex("(市|州|盟|地区|特别行政区)$").containsMatchIn(raw)) return raw
    return "${raw}市"
}

private fun provinceOf(item: CheckInRecord): String =
    PROVINCE_LABELS[item.prefectureId.take(2)] ?: ""

fun listFootprintEntries(items: List<CheckInRecord>, kind: FootprintListKind): List<FootprintListEntry> {
    if (items.isEmpty()) return emptyList()

    if (kind == FootprintListKind.COUNTRY) {
        return listOf(FootprintListEntry("CN", "中国", sub = "China", time = "亚洲"))
    }

    if (kind == FootprintListKind.CITY) {
        val latest = LinkedHashMap<String, CheckInRecord>()
        for (it in items) {
            val city = it.city.trim()
            if (city.isEmpty()) continue
            val prev = latest[city]
            if (prev == null || it.checkedAt > prev.checkedAt) latest[city] = it
        }
        return latest.entries
            .sortedWith(compareBy(java.text.Collator.getInstance(java.util.Locale.CHINESE)) { it.key })
            .map { (city, it) ->
                FootprintListEntry(
                    key = city,
                    title = cityLabel(city),
                    province = provinceOf(it),
                    time = formatCheckDate(it.checkedAt),
                )
            }
    }

    return items.map {
        FootprintListEntry(
            key = it.id,
            title = it.name,
            sub = cityLabel(it.city),
            time = formatCheckTime(it.checkedAt),
        )
    }
}

// ---------- 总统计 ----------

fun buildFootprintStats(items: List<CheckInRecord>): FootprintStats {
    if (items.isEmpty()) return FootprintStats()

    val cities = items.map { it.city.trim() }.filter { it.isNotEmpty() }.toSet()
    val seasons = mutableMapOf("春" to 0, "夏" to 0, "秋" to 0, "冬" to 0)
    val cats = mutableMapOf<String, Int>()
    val continents = LinkedHashSet<ContinentId>()
    var farthest = items[0]
    var farthestKm = -1.0
    var northernmost = items[0]
    var southernmost = items[0]
    var maxLat = -90.0
    var minLat = 90.0

    for (it in items) {
        seasons[seasonOf(it.checkedAt)] = (seasons[seasonOf(it.checkedAt)] ?: 0) + 1
        cats[it.category] = (cats[it.category] ?: 0) + 1
        continentOfRecord(it)?.let { c -> if (c != ContinentId.AN) continents.add(c) }
        coordOf(it)?.let { (lng, lat) ->
            val km = haversineKm(HOME_LNG, HOME_LAT, lng, lat)
            if (km > farthestKm) {
                farthestKm = km
                farthest = it
            }
            if (lat > maxLat) {
                maxLat = lat
                northernmost = it
            }
            if (lat < minLat) {
                minLat = lat
                southernmost = it
            }
        }
    }

    val topSeason = seasons.maxByOrNull { it.value }?.key
    val topCat = cats.maxByOrNull { it.value }

    return FootprintStats(
        countryCount = 1,
        cityCount = cities.size,
        placeCount = items.size,
        topSeason = topSeason,
        farthest = farthest,
        northernmost = northernmost,
        southernmost = southernmost,
        latest = items[0],
        continentCount = continents.size,
        visitedContinents = continents.toList(),
        topCategory = topCat?.let { (CAT_LABEL[it.key] ?: it.key) to it.value },
    )
}
