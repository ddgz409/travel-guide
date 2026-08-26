package com.travelguide.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

private val Context.dataStore by preferencesDataStore(name = "zhijing_prefs")

/**
 * JWT 令牌存储（对齐 RN 版 AsyncStorage token）。
 * OkHttp 拦截器需要同步读取，因此维护一份内存缓存；持久层用 DataStore。
 */
object TokenStore {
    private val KEY_TOKEN = stringPreferencesKey("auth_token")

    @Volatile
    private var cache: String? = null

    @Volatile
    private var context: Context? = null

    fun init(appContext: Context) {
        context = appContext.applicationContext
        // 启动时同步载入内存缓存（一次性小读取，runBlocking 可接受）
        cache = runBlocking { readPersisted() }
    }

    private suspend fun readPersisted(): String? =
        context?.dataStore?.data?.first()?.get(KEY_TOKEN)

    /** 同步读（供 OkHttp 拦截器使用） */
    fun getSync(): String? = cache

    suspend fun set(token: String?) {
        cache = token
        context?.dataStore?.edit { prefs ->
            if (token == null) prefs.remove(KEY_TOKEN) else prefs[KEY_TOKEN] = token
        }
    }
}
