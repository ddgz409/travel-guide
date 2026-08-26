package com.travelguide.app.ui.screens.settings

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

/** 设置页（v1：模型管理 + 账号退出；定位/更新待原生地图全屏页与 OTA 接入后补充） */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenModelManage: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    var username by remember { mutableStateOf<String?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        username = runCatching { ApiClient.auth.me().username }.getOrNull()
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
            Spacer(Modifier.height(8.dp))

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
                sub = "当前登录账号：${username ?: "…"}。退出后可切换其他账号登录。",
                status = username ?: "加载中",
                actionLabel = "退出登录",
                actionDanger = true,
                onAction = { confirmLogout = true },
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("退出登录") },
            text = { Text("确定退出当前账号吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmLogout = false
                        scope.launch {
                            TokenStore.set(null)
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
                    .background(if (actionDanger) ZhijingColors.Danger else ZhijingColors.Brand)
                    .clickable(onClick = onAction)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text(actionLabel, fontSize = 13.sp, color = ZhijingColors.Card)
            }
        }
    }
}
