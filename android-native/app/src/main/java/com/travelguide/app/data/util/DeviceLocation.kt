package com.travelguide.app.data.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import androidx.core.content.ContextCompat
import com.amap.api.location.AMapLocation
import com.amap.api.location.AMapLocationClient
import com.amap.api.location.AMapLocationClientOption
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** 设备定位结果（含精度与来源，精度用于水波半径，来源用于验证角标） */
data class DeviceLocation(
    val lat: Double,
    val lng: Double,
    val accuracy: Float,
    val source: String = "",
)

private const val FRESH_MAX_ACCURACY_M = 80f
private const val FRESH_MAX_AGE_MS = 5 * 60 * 1000L

/** 立即采纳的精度阈值：常规 ≤40 米；手动高精度定位 ≤20 米（等到更好的结果而不是抢第一个） */
private const val GOOD_ACCURACY_M = 40f
private const val HIGH_ACCURACY_M = 20f

private fun isFreshEnough(loc: Location?): Boolean =
    loc != null &&
        loc.accuracy in 0f..FRESH_MAX_ACCURACY_M &&
        System.currentTimeMillis() - loc.time <= FRESH_MAX_AGE_MS

private fun isFreshEnoughAmap(loc: AMapLocation?): Boolean =
    loc != null &&
        loc.errorCode == AMapLocation.LOCATION_SUCCESS &&
        loc.accuracy in 0f..FRESH_MAX_ACCURACY_M &&
        System.currentTimeMillis() - loc.time <= FRESH_MAX_AGE_MS

private fun fromAmap(loc: AMapLocation, source: String) =
    DeviceLocation(loc.latitude, loc.longitude, loc.accuracy, source)

/**
 * 优先高德定位 SDK（返回 GCJ-02，与地图坐标系一致，避免重复纠偏偏东 ~100m）。
 * 失败再回退系统 LocationManager。
 */
private suspend fun fetchAmapSdkLocation(
    context: Context,
    highAccuracy: Boolean,
    timeoutMs: Long,
): DeviceLocation? = withTimeoutOrNull(timeoutMs) {
    suspendCancellableCoroutine { cont ->
        var client: AMapLocationClient? = null
        var finished = false
        fun finish(result: DeviceLocation?) {
            if (finished) return
            finished = true
            runCatching {
                client?.stopLocation()
                client?.onDestroy()
            }
            if (cont.isActive) cont.resume(result)
        }
        try {
            client = AMapLocationClient(context.applicationContext)
            val option = AMapLocationClientOption().apply {
                locationMode = if (highAccuracy) {
                    AMapLocationClientOption.AMapLocationMode.Hight_Accuracy
                } else {
                    AMapLocationClientOption.AMapLocationMode.Battery_Saving
                }
                isOnceLocation = true
                isNeedAddress = false
                isMockEnable = false
                httpTimeOut = timeoutMs.coerceIn(8000L, 30000L)
            }
            client.setLocationOption(option)
            client.setLocationListener { loc ->
                if (loc != null && loc.errorCode == AMapLocation.LOCATION_SUCCESS) {
                    finish(fromAmap(loc, "amap"))
                } else {
                    finish(null)
                }
            }
            client.startLocation()
            cont.invokeOnCancellation { finish(null) }
        } catch (_: Exception) {
            finish(null)
        }
    }
}

private fun peekAmapCache(context: Context): DeviceLocation? = runCatching {
    val client = AMapLocationClient(context.applicationContext)
    val last = client.lastKnownLocation
    client.onDestroy()
    if (isFreshEnoughAmap(last)) fromAmap(last!!, "amap_cache") else null
}.getOrNull()

/**
 * 系统定位回退：网络/WiFi 结果在国内 ROM 上通常已是 GCJ-02；GPS 再走 WGS→GCJ。
 */
private fun toGcj02(loc: Location): DeviceLocation {
    val lat = loc.latitude
    val lng = loc.longitude
    val (outLat, outLng) = if (loc.provider == LocationManager.NETWORK_PROVIDER) {
        lat to lng
    } else {
        wgs84ToGcj02(lat, lng)
    }
    return DeviceLocation(outLat, outLng, loc.accuracy, loc.provider.orEmpty())
}

/**
 * 双路竞速定位（探索页 / 添加足迹共用）。
 */
suspend fun fetchDeviceLocation(context: Context, fresh: Boolean = false, highAccuracy: Boolean = false): DeviceLocation? {
    val granted = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    if (!granted) return null

    val timeoutMs = if (highAccuracy) 25000L else 12000L

    // 1) 高德定位 SDK（与地图同坐标系，优先）
    if (!fresh) {
        peekAmapCache(context)?.let { return it }
    }
    fetchAmapSdkLocation(context, highAccuracy, timeoutMs)?.let { return it }

    // 2) 系统 LocationManager 兜底
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    val candidates = runCatching {
        listOfNotNull(
            lm.getLastKnownLocation(LocationManager.GPS_PROVIDER),
            lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER),
        )
    }.getOrDefault(emptyList())
    if (!fresh) {
        candidates.filter(::isFreshEnough).minByOrNull { it.accuracy }?.let { return toGcj02(it) }
    }
    val staleFallback = candidates.minByOrNull { it.accuracy }

    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
    if (providers.isEmpty()) {
        return staleFallback?.let { toGcj02(it) }
    }

    val result = withTimeoutOrNull(timeoutMs) {
        coroutineScope {
            suspendCancellableCoroutine { cont ->
                var best: Location? = null
                val listeners = mutableListOf<LocationListener>()
                var earlyStop: Job? = null

                fun finish(loc: DeviceLocation) {
                    earlyStop?.cancel()
                    listeners.forEach { runCatching { lm.removeUpdates(it) } }
                    if (cont.isActive) cont.resume(loc)
                }

                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (location.accuracy <= if (highAccuracy) HIGH_ACCURACY_M else GOOD_ACCURACY_M) {
                            finish(toGcj02(location))
                            return
                        }
                        if (best == null || location.accuracy < best!!.accuracy) best = location
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                }
                listeners += listener

                cont.invokeOnCancellation {
                    earlyStop?.cancel()
                    listeners.forEach { runCatching { lm.removeUpdates(it) } }
                }

                val ok = providers.map { p ->
                    runCatching {
                        @Suppress("DEPRECATION")
                        lm.requestLocationUpdates(p, 0L, 0f, listener)
                    }.isSuccess
                }
                if (ok.none { it }) {
                    if (cont.isActive) cont.resume(null)
                    return@suspendCancellableCoroutine
                }

                earlyStop = launch {
                    delay(if (highAccuracy) 15000 else 6000)
                    val b = best
                    if (b != null) finish(toGcj02(b))
                }
            }
        }
    }
    return result ?: staleFallback?.let { toGcj02(it) }
}

/** 上次定位的内存缓存（对齐 RN peekCachedLocation/peekCachedCity/rememberLocation） */
object LocationCache {
    @Volatile var location: DeviceLocation? = null
        private set

    @Volatile var city: String? = null
        private set

    fun remember(loc: DeviceLocation, cityName: String?) {
        location = loc
        if (!cityName.isNullOrBlank()) city = cityName
    }

    /** 城市去掉「市」后缀（对齐 RN peekCachedCity()?.replace(/市$/, "")） */
    fun cityStripped(): String? = city?.removeSuffix("市")?.takeIf { it.isNotBlank() }
}
