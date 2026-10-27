package com.travelguide.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

private val Context.locationPrefs by preferencesDataStore(name = "zhijing_location")

/** 地图定位用户偏好（对齐 RN locationPrefs.ts） */
object LocationPrefs {
    private const val KEY = "travel_guide_location_consent"
    private val prefKey = stringPreferencesKey(KEY)

    @Volatile private var context: Context? = null
    @Volatile private var cache: String? = null

    fun init(appContext: Context) {
        context = appContext.applicationContext
        runBlocking { reload() }
    }

    private suspend fun reload() {
        cache = context?.locationPrefs?.data?.first()?.get(prefKey)
    }

    fun consentSync(): String? = cache

    fun isGrantedSync(): Boolean = cache == "granted"

    suspend fun load(): String? {
        reload()
        return cache
    }

    suspend fun save(value: String) {
        require(value == "granted" || value == "denied")
        cache = value
        context?.locationPrefs?.edit { it[prefKey] = value }
    }
}
