package com.travelguide.app.data.util

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * WGS-84（系统 GPS）→ GCJ-02（国测局/火星坐标）转换。
 * 高德地图基于 GCJ-02，系统定位坐标直接上图会偏移约 100~600 米，
 * 上地图 / 调高德系服务（含后端 regeo）前必须先纠偏。
 */
private const val GCJ_A = 6378245.0
private const val GCJ_EE = 0.00669342162296594323

fun wgs84ToGcj02(lat: Double, lng: Double): Pair<Double, Double> {
    if (outOfChina(lat, lng)) return lat to lng
    var dLat = transformLat(lng - 105.0, lat - 35.0)
    var dLng = transformLng(lng - 105.0, lat - 35.0)
    val radLat = lat / 180.0 * PI
    var magic = sin(radLat)
    magic = 1 - GCJ_EE * magic * magic
    val sqrtMagic = sqrt(magic)
    dLat = dLat * 180.0 / (GCJ_A * (1 - GCJ_EE) / (magic * sqrtMagic) * PI)
    dLng = dLng * 180.0 / (GCJ_A / sqrtMagic * cos(radLat) * PI)
    return (lat + dLat) to (lng + dLng)
}

private fun outOfChina(lat: Double, lng: Double): Boolean =
    lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271

private fun transformLat(x: Double, y: Double): Double {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(abs(x))
    ret += (20.0 * sin(6.0 * x * PI) + 20.0 * sin(2.0 * x * PI)) * 2.0 / 3.0
    ret += (20.0 * sin(y * PI) + 40.0 * sin(y / 3.0 * PI)) * 2.0 / 3.0
    ret += (160.0 * sin(y / 12.0 * PI) + 320.0 * sin(y * PI / 30.0)) * 2.0 / 3.0
    return ret
}

private fun transformLng(x: Double, y: Double): Double {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(abs(x))
    ret += (20.0 * sin(6.0 * x * PI) + 20.0 * sin(2.0 * x * PI)) * 2.0 / 3.0
    ret += (20.0 * sin(x * PI) + 40.0 * sin(x / 3.0 * PI)) * 2.0 / 3.0
    ret += (150.0 * sin(x / 12.0 * PI) + 300.0 * sin(x / 30.0 * PI)) * 2.0 / 3.0
    return ret
}
