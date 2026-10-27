package com.travelguide.app.data.model

import android.content.Context
import com.travelguide.app.data.api.AppJson
import kotlinx.serialization.Serializable

/** 旅行地图省级边界（Albers 中国投影，数据来自 mobile/assets/chinaProvincePaths.ts） */

@Serializable
data class ChinaProvincePath(
    val key: String,
    val label: String,
    val path: String,
    val cx: Double,
    val cy: Double,
    val minX: Double,
    val minY: Double,
    val maxX: Double,
    val maxY: Double,
)

@Serializable
private data class ProvincePathsAsset(
    val view: MapViewSize = MapViewSize(),
    val provinces: List<ChinaProvincePath> = emptyList(),
)

@Serializable
data class MapViewSize(val w: Int = 1000, val h: Int = 854)

object ProvinceMapData {
    val TRAVEL_MAP_VIEW = MapViewSize(1000, 854)

    @Volatile private var provinces: List<ChinaProvincePath>? = null

    fun getProvinces(context: Context): List<ChinaProvincePath> {
        provinces?.let { return it }
        synchronized(this) {
            provinces?.let { return it }
            val json = context.assets.open("china_province_paths.json").bufferedReader().readText()
            val loaded = AppJson.decodeFromString<ProvincePathsAsset>(json).provinces
            provinces = loaded
            return loaded
        }
    }

    fun provinceLabel(key: String): String = PROVINCE_LABELS[key] ?: key

    val PROVINCE_LABELS: Map<String, String> = mapOf(
        "11" to "北京", "12" to "天津", "13" to "河北", "14" to "山西", "15" to "内蒙古",
        "21" to "辽宁", "22" to "吉林", "23" to "黑龙江",
        "31" to "上海", "32" to "江苏", "33" to "浙江", "34" to "安徽", "35" to "福建",
        "36" to "江西", "37" to "山东",
        "41" to "河南", "42" to "湖北", "43" to "湖南", "44" to "广东", "45" to "广西",
        "46" to "海南",
        "50" to "重庆", "51" to "四川", "52" to "贵州", "53" to "云南", "54" to "西藏",
        "61" to "陕西", "62" to "甘肃", "63" to "青海", "64" to "宁夏", "65" to "新疆",
        "71" to "台湾", "81" to "香港", "82" to "澳门",
    )
}
