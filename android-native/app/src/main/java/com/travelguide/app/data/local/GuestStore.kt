package com.travelguide.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.travelguide.app.data.api.AppJson
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer

private val Context.guestDataStore by preferencesDataStore(name = "zhijing_guest")

/** 游客模式 + 本地行程 id（对齐 RN AuthContext GUEST_KEY / GUEST_TRIPS_KEY） */
object GuestStore {
    const val TRIP_LIMIT = 3

    private val KEY_GUEST = booleanPreferencesKey("guest_mode")
    private val KEY_TRIPS = stringPreferencesKey("guest_trip_ids")

    @Volatile private var isGuestCache = false
    @Volatile private var tripIdsCache: List<String> = emptyList()
    @Volatile private var context: Context? = null

    fun init(appContext: Context) {
        context = appContext.applicationContext
        runBlocking { reloadCache() }
    }

    private suspend fun reloadCache() {
        val prefs = context?.guestDataStore?.data?.first() ?: return
        isGuestCache = prefs[KEY_GUEST] == true
        tripIdsCache = decodeTrips(prefs[KEY_TRIPS])
    }

    fun isGuestSync(): Boolean = isGuestCache

    fun tripIdsSync(): List<String> = tripIdsCache

    suspend fun enterGuest() {
        isGuestCache = true
        context?.guestDataStore?.edit { it[KEY_GUEST] = true }
    }

    /** 登录成功后退出游客态（保留本地 guest trip 列表供下次游客使用） */
    suspend fun exitGuestMode() {
        isGuestCache = false
        context?.guestDataStore?.edit { it[KEY_GUEST] = false }
    }

    suspend fun rememberTrip(tripId: String) {
        val id = tripId.trim()
        if (id.isEmpty()) return
        val next = trimTripIds((listOf(id) + tripIdsCache).distinct())
        tripIdsCache = next
        context?.guestDataStore?.edit {
            it[KEY_GUEST] = true
            it[KEY_TRIPS] = encodeTrips(next)
        }
        isGuestCache = true
    }

    private fun trimTripIds(ids: List<String>): List<String> =
        ids.filter { it.isNotBlank() }.distinct().take(TRIP_LIMIT)

    private fun encodeTrips(ids: List<String>): String =
        AppJson.encodeToString(ListSerializer(String.serializer()), ids)

    private fun decodeTrips(raw: String?): List<String> =
        runCatching {
            trimTripIds(
                AppJson.decodeFromString(ListSerializer(String.serializer()), raw.orEmpty().ifBlank { "[]" }),
            )
        }.getOrDefault(emptyList())
}
