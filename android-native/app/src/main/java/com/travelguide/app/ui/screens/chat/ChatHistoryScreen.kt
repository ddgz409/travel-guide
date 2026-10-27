package com.travelguide.app.ui.screens.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.ChatHistorySession
import com.travelguide.app.data.local.ChatHistoryStore
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch
import java.util.Calendar

/** 对话历史（对齐 RN ChatHistoryScreen） */
@Composable
fun ChatHistoryScreen(
    onBack: () -> Unit,
    onOpenSession: (sessionId: String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var userKey by remember { mutableStateOf("guest") }
    var items by remember { mutableStateOf(emptyList<ChatHistorySession>()) }
    var loading by remember { mutableStateOf(true) }
    var deleteTarget by remember { mutableStateOf<ChatHistorySession?>(null) }

    LaunchedEffect(Unit) {
        userKey = runCatching { ApiClient.auth.me().id }.getOrDefault("guest")
        items = ChatHistoryStore.listSessions(userKey)
        loading = false
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader(
            title = "对话历史",
            onBack = onBack,
            trailing = {
                Text(
                    "新对话",
                    fontSize = 14.sp,
                    color = ZhijingColors.BrandHot,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable {
                        onOpenSession(ChatHistoryStore.genSessionId())
                    },
                )
            },
        )
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
            items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("还没有对话记录，去和 AI 助手聊聊吧", fontSize = 14.sp, color = ZhijingColors.Muted)
            }
            else -> LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                items(items, key = { it.id }) { s ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 10.dp)
                            .clickable { onOpenSession(s.id) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                s.title.ifBlank { "新对话" },
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                "${fmtTime(s.updatedAt)} · ${s.msgs.size} 条消息",
                                fontSize = 12.sp,
                                color = ZhijingColors.Muted,
                            )
                        }
                        Text(
                            "删除",
                            fontSize = 13.sp,
                            color = ZhijingColors.Danger,
                            modifier = Modifier
                                .padding(start = 12.dp)
                                .clickable { deleteTarget = s },
                        )
                    }
                }
            }
        }
    }

    deleteTarget?.let { s ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("删除记录") },
            text = { Text("确定删除这条对话记录吗？") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        ChatHistoryStore.deleteSession(userKey, s.id)
                        items = ChatHistoryStore.listSessions(userKey)
                        deleteTarget = null
                    }
                }) { Text("删除") }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("取消") }
            },
        )
    }
}

private fun fmtTime(ts: Long): String {
    val d = Calendar.getInstance().apply { timeInMillis = ts }
    val now = Calendar.getInstance()
    val sameDay = d.get(Calendar.YEAR) == now.get(Calendar.YEAR) &&
        d.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)
    val hh = d.get(Calendar.HOUR_OF_DAY).toString().padStart(2, '0')
    val mm = d.get(Calendar.MINUTE).toString().padStart(2, '0')
    return if (sameDay) "今天 $hh:$mm" else "${d.get(Calendar.MONTH) + 1}月${d.get(Calendar.DAY_OF_MONTH)}日 $hh:$mm"
}
