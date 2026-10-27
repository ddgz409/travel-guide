package com.travelguide.app.ui.components

import android.widget.Toast
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.travelguide.app.data.util.AppUpdate
import kotlinx.coroutines.launch

/** 启动时检查 OTA（对齐 RN maybePromptUpdateOnLaunch） */
@Composable
fun UpdateLaunchPrompt() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var prompt by remember { mutableStateOf<AppUpdate.CheckResult.Available?>(null) }

    LaunchedEffect(Unit) {
        when (val result = AppUpdate.check()) {
            is AppUpdate.CheckResult.Available -> {
                if (!AppUpdate.shouldSkipLaunchPrompt(context, result.remote)) {
                    prompt = result
                }
            }
            else -> {}
        }
    }

    prompt?.let { available ->
        val remote = available.remote
        AlertDialog(
            onDismissRequest = {
                if (!remote.force) {
                    scope.launch {
                        AppUpdate.skipLaunchPrompt(context, remote)
                        prompt = null
                    }
                }
            },
            title = { Text("发现新版本 ${remote.versionName}") },
            text = {
                Text(remote.notes.ifBlank { "请下载安装以获取最新功能与修复。" })
            },
            confirmButton = {
                TextButton(onClick = {
                    prompt = null
                    runCatching { AppUpdate.openApkDownload(context, remote.apkUrl) }
                        .onFailure {
                            Toast.makeText(context, "无法打开下载链接", Toast.LENGTH_SHORT).show()
                        }
                }) { Text("下载更新") }
            },
            dismissButton = if (!remote.force) {
                {
                    TextButton(onClick = {
                        scope.launch {
                            AppUpdate.skipLaunchPrompt(context, remote)
                            prompt = null
                        }
                    }) { Text("稍后") }
                }
            } else null,
        )
    }
}
