package com.travelguide.app.data.local

import android.content.Context
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.model.CITY_TO_PREFECTURE
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant

/** 城市/景点打卡记录（本地 SharedPreferences，离线可用，对齐 RN checkInStore.ts） */

@Serializable
data class CheckInRecord(
    val id: String,
    val city: String,
    val name: String,
    val category: String, // spots / foods / humanities
    val prefectureId: String,
    val checkedAt: String,
    val lng: Double? = null,
    val lat: Double? = null,
    val address: String? = null,
)

@Serializable
private data class CheckInStoreData(val items: List<CheckInRecord> = emptyList())

@Serializable
data class FootprintHistoryItem(
    val name: String,
    val address: String? = null,
    val city: String? = null,
    val lng: Double? = null,
    val lat: Double? = null,
)

data class AddCheckInInput(
    val city: String,
    val name: String,
    val category: String,
    val lng: Double? = null,
    val lat: Double? = null,
    val address: String? = null,
)

// ---------- 地级市解析（对齐 RN assets/cityToPrefecture.ts 的 resolve 函数） ----------

private val STRIP_SUFFIX = Regex("(特别行政区|自治州|地区|盟|市|区|县)$")

fun resolvePrefectureId(city: String): String? {
    val raw = city.trim()
    if (raw.isEmpty()) return null
    CITY_TO_PREFECTURE[raw]?.let { return it }
    val key = raw.replace(STRIP_SUFFIX, "")
    CITY_TO_PREFECTURE[key]?.let { return it }
    for ((name, id) in CITY_TO_PREFECTURE) {
        val n = name.replace(STRIP_SUFFIX, "")
        if (key == n || key.startsWith(n) || n.startsWith(key)) return id
    }
    return null
}

/** 从地址/城市拼串里解析地级市（取最长匹配），返回 (id, city) */
fun resolvePrefectureFromText(text: String): Pair<String, String>? {
    val raw = text.trim()
    if (raw.isEmpty()) return null
    resolvePrefectureId(raw)?.let {
        val name = raw.replace(STRIP_SUFFIX, "").ifEmpty { raw }
        return it to name
    }
    var best: Pair<String, String>? = null // name to id
    for ((name, id) in CITY_TO_PREFECTURE) {
        if (!raw.contains(name)) continue
        if (best == null || name.length > best.first.length) best = name to id
    }
    val (bName, bId) = best ?: return null
    return bId to bName.replace(STRIP_SUFFIX, "").ifEmpty { bName }
}

// ---------- 存储 ----------

/**
 * 打卡记录 + 足迹搜索历史的本地存储（对齐 RN AsyncStorage 两份 key）。
 * 内存缓存 + SharedPreferences 持久，读写走 IO 线程。
 */
object CheckInStore {
    private const val PREFS = "zhijing_checkins"
    private const val KEY_CHECKINS = "travel_guide_checkins:v2"
    private const val KEY_HISTORY = "travel_guide_footprint_search:v1"
    private const val HISTORY_LIMIT = 16

    @Volatile private var prefs: android.content.SharedPreferences? = null

    @Volatile private var cache: List<CheckInRecord>? = null

    fun init(appContext: Context) {
        prefs = appContext.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    private fun makeId(city: String, name: String) = "${city.trim()}::${name.trim()}"

    private suspend fun readItems(): List<CheckInRecord> = withContext(Dispatchers.IO) {
        cache?.let { return@withContext it }
        val raw = prefs?.getString(KEY_CHECKINS, null)
        val items = if (raw.isNullOrBlank()) emptyList() else runCatching {
            AppJson.decodeFromString<CheckInStoreData>(raw).items
        }.getOrDefault(emptyList())
        cache = items
        items
    }

    private suspend fun writeItems(items: List<CheckInRecord>) = withContext(Dispatchers.IO) {
        cache = items
        prefs?.edit()?.putString(KEY_CHECKINS, AppJson.encodeToString(CheckInStoreData.serializer(), CheckInStoreData(items)))?.apply()
    }

    /** 按打卡时间倒序（对齐 RN listCheckIns） */
    suspend fun list(): List<CheckInRecord> =
        readItems().sortedByDescending { it.checkedAt }

    suspend fun checkedPrefectureIds(): List<String> =
        list().mapNotNull { it.prefectureId.takeIf(String::isNotBlank) }.distinct()

    suspend fun isChecked(city: String, name: String): Boolean {
        val id = makeId(city, name)
        return readItems().any { it.id == id }
    }

    /** 打卡（同名覆盖），无法解析地级市时抛 IllegalStateException（对齐 RN throw） */
    suspend fun add(input: AddCheckInInput): CheckInRecord {
        val name = input.name.trim()
        var city = input.city.trim()
        var prefectureId = resolvePrefectureId(city)
        if (prefectureId == null) {
            val hit = resolvePrefectureFromText("${city} ${input.address.orEmpty()} $name")
            if (hit != null) {
                prefectureId = hit.first
                city = hit.second
            }
        }
        requireNotNull(prefectureId) { "无法识别「${city.ifBlank { name }}」所属地级市，暂无法打卡" }

        val record = CheckInRecord(
            id = makeId(city, name),
            city = city,
            name = name,
            category = input.category,
            prefectureId = prefectureId,
            checkedAt = Instant.now().toString(),
            lng = input.lng,
            lat = input.lat,
            address = input.address,
        )
        val items = readItems().toMutableList()
        val idx = items.indexOfFirst { it.id == record.id }
        if (idx >= 0) items[idx] = record else items.add(0, record)
        writeItems(items)
        return record
    }

    suspend fun remove(city: String, name: String) {
        val id = makeId(city, name)
        writeItems(readItems().filterNot { it.id == id })
    }

    // ---------- 足迹搜索历史 ----------

    suspend fun historyList(): List<FootprintHistoryItem> = withContext(Dispatchers.IO) {
        val raw = prefs?.getString(KEY_HISTORY, null)
        if (raw.isNullOrBlank()) emptyList() else runCatching {
            AppJson.decodeFromString<List<FootprintHistoryItem>>(raw)
        }.getOrDefault(emptyList())
    }

    suspend fun historyPush(item: FootprintHistoryItem) {
        val name = item.name.trim()
        if (name.isEmpty()) return
        val prev = historyList()
        val next = (listOf(item.copy(name = name)) + prev.filterNot {
            it.name == name && it.address.orEmpty() == item.address.orEmpty()
        }).take(HISTORY_LIMIT)
        withContext(Dispatchers.IO) {
            prefs?.edit()?.putString(
                KEY_HISTORY,
                AppJson.encodeToString(ListSerializer(FootprintHistoryItem.serializer()), next),
            )?.apply()
        }
    }

    suspend fun historyClear() = withContext(Dispatchers.IO) {
        prefs?.edit()?.remove(KEY_HISTORY)?.apply()
    }
}
