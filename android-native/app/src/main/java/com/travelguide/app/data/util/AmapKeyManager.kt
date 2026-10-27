package com.travelguide.app.data.util

import android.app.Application
import android.util.Log
import com.amap.api.maps.ExceptionLogger
import com.amap.api.maps.MapsInitializer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 高德 Android 地图 Key 池：主 Key 鉴权失败（SHA1 不匹配 / Key 无效等）时自动切备用。
 * 对齐后端 Web 服务双 Key 逻辑；每次冷启动优先用主 Key。
 */
object AmapKeyManager {
    private const val TAG = "AmapKeyManager"

    /** 主 → 备（Manifest meta-data 与主 Key 保持一致） */
    private val KEYS = listOf(
        "7d58611092da0873f64e7fc4690e7a34",
        "fb02cc4aaba7fa927a4e0fa5c1ba9403",
    )

    private val exhausted = mutableSetOf<String>()
    private val _generation = MutableStateFlow(0)
    val generation: StateFlow<Int> = _generation.asStateFlow()

    fun init(app: Application) {
        applyActiveKey()
        MapsInitializer.setExceptionLogger(object : ExceptionLogger {
            override fun onException(t: Throwable?) {
                onKeyFailure(t)
            }

            override fun onDownloaderException(i: Int, i1: Int) {}
        })
        Log.i(TAG, "active android key ...${activeKey()?.takeLast(8) ?: "none"}")
    }

    fun activeKey(): String? = KEYS.firstOrNull { it !in exhausted }

    fun applyActiveKey() {
        activeKey()?.let { MapsInitializer.setApiKey(it) }
    }

    fun isKeyError(t: Throwable?): Boolean {
        val msg = (t?.message ?: t?.toString() ?: "").uppercase()
        return listOf(
            "INVALID_USER_KEY",
            "USERKEY_PLAT_NOMATCH",
            "INVALID_USER_SCODE",
            "10001",
            "10009",
            "鉴权",
            "AUTH",
        ).any { token -> token in msg }
    }

    fun onKeyFailure(t: Throwable?) {
        if (!isKeyError(t)) return
        val failed = KEYS.firstOrNull { it !in exhausted } ?: return
        exhausted.add(failed)
        val next = activeKey()
        if (next == null) {
            Log.e(TAG, "所有 Android 地图 Key 均不可用")
            return
        }
        Log.w(TAG, "Key ...${failed.takeLast(8)} 失败，切换 ...${next.takeLast(8)}: ${t?.message}")
        MapsInitializer.setApiKey(next)
        _generation.value += 1
    }
}
