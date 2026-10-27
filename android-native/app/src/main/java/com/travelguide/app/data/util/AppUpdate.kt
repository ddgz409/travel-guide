package com.travelguide.app.data.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.travelguide.app.BuildConfig
import com.travelguide.app.data.api.AndroidUpdateInfo
import com.travelguide.app.data.api.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

private val Context.updatePrefs by preferencesDataStore(name = "zhijing_update")

/** Android OTA 检查（对齐 RN appUpdate.ts） */
object AppUpdate {
    private val SKIP_KEY = intPreferencesKey("travel_guide_skip_update_code")

    fun currentVersionCode(): Int = BuildConfig.VERSION_CODE

    fun currentVersionName(): String = BuildConfig.VERSION_NAME

    sealed class CheckResult {
        data object Unsupported : CheckResult()
        data class Latest(val remote: AndroidUpdateInfo, val localCode: Int) : CheckResult()
        data class Available(val remote: AndroidUpdateInfo, val localCode: Int) : CheckResult()
        data class Error(val message: String) : CheckResult()
    }

    suspend fun check(): CheckResult = withContext(Dispatchers.IO) {
        runCatching {
            val remote = ApiClient.app.androidUpdate()
            val local = currentVersionCode()
            if (remote.versionCode > local) CheckResult.Available(remote, local)
            else CheckResult.Latest(remote, local)
        }.getOrElse { CheckResult.Error(it.message ?: "检查更新失败") }
    }

    fun openApkDownload(context: Context, apkUrl: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    suspend fun shouldSkipLaunchPrompt(context: Context, remote: AndroidUpdateInfo): Boolean {
        if (remote.force) return false
        val skipped = context.updatePrefs.data.first()[SKIP_KEY]
        return skipped == remote.versionCode
    }

    suspend fun skipLaunchPrompt(context: Context, remote: AndroidUpdateInfo) {
        context.updatePrefs.edit { it[SKIP_KEY] = remote.versionCode }
    }
}
