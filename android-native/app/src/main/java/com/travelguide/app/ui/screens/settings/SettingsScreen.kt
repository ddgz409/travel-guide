package com.travelguide.app.ui.screens.settings

import android.Manifest
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.GuestStore
import com.travelguide.app.data.local.LocationPrefs
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.util.AppUpdate
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenModelManage: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    val context = LocalContext.current
    var username by remember { mutableStateOf<String?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    var locationConsent by remember { mutableStateOf<String?>(LocationPrefs.consentSync()) }
    var checkingUpdate by remember { mutableStateOf(false) }
    var updateDialog by remember { mutableStateOf<AppUpdate.CheckResult?>(null) }
    val scope = rememberCoroutineScope()
    val isGuest = GuestStore.isGuestSync() && TokenStore.getSync() == null

    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val ok = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        scope.launch {
            if (ok) {
                LocationPrefs.save("granted")
                locationConsent = "granted"
            } else {
                LocationPrefs.save("denied")
                locationConsent = "denied"
                Toast.makeText(context, "请在系统设置中允许定位权限", Toast.LENGTH_SHORT).show()
            }
        }
    }

    LaunchedEffect(Unit) {
        username = when {
            isGuest -> "游客"
            else -> runCatching { ApiClient.auth.me().username }.getOrNull()
        }
        locationConsent = LocationPrefs.load()
    }

    fun setLocationEnabled(enabled: Boolean) {
        if (enabled) {
            permLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        } else {
            scope.launch {
                LocationPrefs.save("denied")
                locationConsent = "denied"
            }
        }
    }

    fun checkUpdate() {
        checkingUpdate = true
        scope.launch {
            updateDialog = AppUpdate.check()
            checkingUpdate = false
        }
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "‹",
                fontSize = 26.sp,
                color = ZhijingColors.Ink,
                modifier = Modifier.clickable { onBack() }.padding(8.dp),
            )
            Text("设置", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        }

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            SettingCard(
                title = "地图定位",
                sub = "开启后，可在全屏地图中显示你的当前位置。首次使用会弹窗询问。",
                status = when (locationConsent) {
                    "granted" -> "已允许"
                    "denied" -> "已关闭"
                    else -> "尚未设置"
                },
                actionLabel = if (locationConsent == "granted") "关闭定位" else "开启定位",
                actionSecondary = locationConsent == "granted",
                onAction = { setLocationEnabled(locationConsent != "granted") },
            )
            Spacer(Modifier.height(12.dp))

            SettingCard(
                title = "应用更新",
                sub = "当前版本 ${AppUpdate.currentVersionName()}（${AppUpdate.currentVersionCode()}）。有新版本时可下载安装包更新。",
                status = "检查服务器版本",
                actionLabel = if (checkingUpdate) "检查中…" else "检查更新",
                actionLoading = checkingUpdate,
                onAction = { if (!checkingUpdate) checkUpdate() },
            )
            Spacer(Modifier.height(12.dp))

            SettingCard(
                title = "管理模型",
                sub = "添加自定义 LLM 供应商，配置 API Key 和模型。",
                status = "AI 助手 / 攻略生成",
                actionLabel = "去管理",
                onAction = onOpenModelManage,
            )
            Spacer(Modifier.height(12.dp))

            SettingCard(
                title = "账号",
                sub = if (isGuest) {
                    "当前为游客体验，退出后可登录账号云端保存行程。"
                } else {
                    "当前登录账号：${username ?: "…"}。退出后可切换其他账号登录。"
                },
                status = username ?: "加载中",
                actionLabel = if (isGuest) "退出游客" else "退出登录",
                actionDanger = true,
                onAction = { confirmLogout = true },
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    when (val d = updateDialog) {
        is AppUpdate.CheckResult.Latest -> AlertDialog(
            onDismissRequest = { updateDialog = null },
            title = { Text("已是最新") },
            text = { Text("当前版本 ${AppUpdate.currentVersionName()} (${d.localCode})") },
            confirmButton = { TextButton(onClick = { updateDialog = null }) { Text("好的") } },
        )
        is AppUpdate.CheckResult.Error -> AlertDialog(
            onDismissRequest = { updateDialog = null },
            title = { Text("检查失败") },
            text = { Text(d.message) },
            confirmButton = { TextButton(onClick = { updateDialog = null }) { Text("好的") } },
        )
        is AppUpdate.CheckResult.Available -> {
            val remote = d.remote
            AlertDialog(
                onDismissRequest = { if (!remote.force) updateDialog = null },
                title = { Text("发现新版本 ${remote.versionName}") },
                text = {
                    Text(
                        buildString {
                            append("当前：${AppUpdate.currentVersionName()} (${d.localCode})\n")
                            append("最新：${remote.versionName} (${remote.versionCode})")
                            if (remote.notes.isNotBlank()) append("\n\n${remote.notes}")
                            if (!remote.apkAvailable) append("\n\n（服务器尚未上传 APK 文件，链接可能暂时无效）")
                        },
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        updateDialog = null
                        runCatching { AppUpdate.openApkDownload(context, remote.apkUrl) }
                            .onFailure { Toast.makeText(context, "无法打开下载链接", Toast.LENGTH_SHORT).show() }
                    }) { Text("下载更新") }
                },
                dismissButton = if (!remote.force) {
                    { TextButton(onClick = { updateDialog = null }) { Text("稍后") } }
                } else null,
            )
        }
        else -> {}
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text(if (isGuest) "退出游客" else "退出登录") },
            text = { Text(if (isGuest) "确定退出游客模式吗？" else "确定退出当前账号吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmLogout = false
                        scope.launch {
                            if (isGuest) GuestStore.exitGuestMode()
                            else TokenStore.set(null)
                            onLoggedOut()
                        }
                    },
                ) { Text("退出", color = ZhijingColors.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogout = false }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun SettingCard(
    title: String,
    sub: String,
    status: String,
    actionLabel: String,
    actionDanger: Boolean = false,
    actionSecondary: Boolean = false,
    actionLoading: Boolean = false,
    onAction: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .padding(16.dp),
    ) {
        Text(title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
        Spacer(Modifier.height(4.dp))
        Text(sub, fontSize = 13.sp, color = ZhijingColors.Muted)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(status, fontSize = 13.sp, color = ZhijingColors.Muted, modifier = Modifier.weight(1f))
            Box(
                Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        when {
                            actionDanger -> ZhijingColors.Danger
                            actionSecondary -> ZhijingColors.BgSurface
                            else -> ZhijingColors.Brand
                        },
                    )
                    .clickable(enabled = !actionLoading, onClick = onAction)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                if (actionLoading) {
                    CircularProgressIndicator(Modifier.height(16.dp), strokeWidth = 2.dp, color = ZhijingColors.Card)
                } else {
                    Text(
                        actionLabel,
                        fontSize = 13.sp,
                        color = if (actionSecondary) ZhijingColors.Muted else ZhijingColors.Card,
                    )
                }
            }
        }
    }
}
