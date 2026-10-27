package com.travelguide.app.data.local

import android.content.Context
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.resolveImageUrl
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * 地点封面图缓存（对齐 RN utils/placeImage.ts）：
 * - 内存 Map：进程内秒开
 * - SharedPreferences：14 天 TTL，杀进程后仍可复用
 * 避免探索首页每次重新打 place-images 接口导致卡一下。
 */
object PlaceImageCache {
    private const val PREFS = "travel_guide_place_img"
    // v5：配合后端「名称匹配 + 主图优先」，丢掉可能错配的旧缓存
    private const val PREFIX = "place_img:amap:v5:"
    private const val TTL_MS = 14L * 24 * 60 * 60 * 1000

    private val mem = ConcurrentHashMap<String, List<String>>()
    private val inflight = ConcurrentHashMap<String, Mutex>()
    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    private fun key(city: String, name: String, kind: String, poiId: String, limit: Int): String =
        "${city.trim()}|${name.trim()}|$limit|$kind|${poiId.trim()}"

    /** 同步读内存（Compose 首帧可先展示） */
    fun peek(city: String, name: String, kind: String = "", poiId: String = "", limit: Int = 1): List<String>? {
        if (city.isBlank() || name.isBlank()) return null
        return mem[key(city, name, kind, poiId, limit)]
    }

    /**
     * 取封面图 URL 列表（已 resolve）。
     * 顺序：内存 → 磁盘 → 网络；同 key 并发只打一次网。
     */
    suspend fun getUrls(
        city: String,
        name: String,
        kind: String = "",
        poiId: String = "",
        limit: Int = 1,
    ): List<String> = withContext(Dispatchers.IO) {
        if (city.isBlank() || name.isBlank()) return@withContext emptyList()
        val k = key(city, name, kind, poiId, limit)

        mem[k]?.let { return@withContext it }

        loadDisk(k)?.let { cached ->
            mem[k] = cached
            return@withContext cached
        }

        val lock = inflight.getOrPut(k) { Mutex() }
        lock.withLock {
            mem[k]?.let { return@withContext it }
            loadDisk(k)?.let {
                mem[k] = it
                return@withContext it
            }
            val urls = runCatching {
                // 不传空 poi_id，与 RN 一致（仅有 id 时才带该 query）
                val result = if (poiId.isBlank()) {
                    ApiClient.destinations.placeImages(city, name, kind, limit)
                } else {
                    ApiClient.destinations.placeImages(city, name, kind, limit, poiId)
                }
                val raw = result.images.ifEmpty {
                    listOfNotNull(result.image)
                }
                raw.map { resolveImageUrl(it) }
                    .filter { it.isNotBlank() }
                    .take(limit.coerceAtLeast(1))
            }.getOrDefault(emptyList())
            if (urls.isNotEmpty()) {
                mem[k] = urls
                saveDisk(k, urls)
            }
            urls
        }.also {
            inflight.remove(k)
        }
    }

    private fun loadDisk(k: String): List<String>? {
        val raw = prefs?.getString(PREFIX + k, null) ?: return null
        return runCatching {
            val obj = JSONObject(raw)
            val at = obj.optLong("at", 0L)
            if (System.currentTimeMillis() - at > TTL_MS) return null
            val arr = obj.optJSONArray("urls") ?: return null
            buildList {
                for (i in 0 until arr.length()) {
                    val u = arr.optString(i)
                    if (u.isNotBlank()) add(u)
                }
            }.takeIf { it.isNotEmpty() }
        }.getOrNull()
    }

    private fun saveDisk(k: String, urls: List<String>) {
        if (urls.isEmpty()) return
        val arr = JSONArray()
        urls.forEach { arr.put(it) }
        val obj = JSONObject().put("at", System.currentTimeMillis()).put("urls", arr)
        prefs?.edit()?.putString(PREFIX + k, obj.toString())?.apply()
    }
}
