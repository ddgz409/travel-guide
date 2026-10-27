package com.travelguide.app.data.local

import android.content.Context
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.api.CityInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

/** 城市探索 API 结果本地缓存（对齐 RN cityInfoCache.ts，7 天 TTL） */
object CityInfoCache {
    private const val PREFIX = "city_info:v3:"
    private const val TTL_MS = 7L * 24 * 60 * 60 * 1000

    @Volatile
    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        prefs = context.applicationContext.getSharedPreferences("city_info_cache", Context.MODE_PRIVATE)
    }

    @Serializable
    private data class Entry(val at: Long, val data: CityInfo)

    suspend fun get(city: String): CityInfo? = withContext(Dispatchers.IO) {
        val p = prefs ?: return@withContext null
        val raw = p.getString(PREFIX + city.trim(), null) ?: return@withContext null
        runCatching {
            val entry = AppJson.decodeFromString<Entry>(raw)
            if (System.currentTimeMillis() - entry.at > TTL_MS) {
                p.edit().remove(PREFIX + city.trim()).apply()
                null
            } else {
                entry.data
            }
        }.getOrNull()
    }

    suspend fun set(city: String, data: CityInfo) = withContext(Dispatchers.IO) {
        val p = prefs ?: return@withContext
        if (data.foods.isEmpty() && data.spots.isEmpty()) return@withContext
        runCatching {
            p.edit()
                .putString(PREFIX + city.trim(), AppJson.encodeToString(Entry.serializer(), Entry(System.currentTimeMillis(), data)))
                .apply()
        }
    }
}
