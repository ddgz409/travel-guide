package com.travelguide.app.ui.screens.share

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.model.Trip
import com.travelguide.app.ui.components.MapHeader
import com.travelguide.app.ui.screens.trip.CollaboratorsRow
import com.travelguide.app.ui.screens.trip.SLOT_LABEL
import com.travelguide.app.ui.screens.trip.TYPE_LABEL
import com.travelguide.app.ui.screens.trip.typeBadge
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** 从完整分享链接或裸 token 中提取 share token（对齐 RN shareLink.ts） */
private fun extractShareToken(input: String): String? {
    val text = input.trim()
    if (text.isEmpty()) return null
    Regex("/share/([A-Za-z0-9_-]+)").find(text)?.let { return it.groupValues[1] }
    if (Regex("^[A-Za-z0-9_-]{8,}$").matches(text)) return text
    return null
}

/**
 * 分享页（对齐 RN ShareScreen + ShareLinkInput）：
 * - 无 token：粘贴链接输入框；
 * - 有 token：展示共享行程（天数切换 + 点位 + 地图），协作模式可加入共同编辑。
 */
@Composable
fun ShareScreen(
    initialToken: String?,
    onBack: () -> Unit,
    onOpenTrip: (String) -> Unit,
) {
    var token by remember { mutableStateOf(initialToken) }
    var trip by remember { mutableStateOf<Trip?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var dayIdx by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun load(tk: String) {
        try {
            trip = ApiClient.trips.getShared(tk)
            error = null
        } catch (e: HttpException) {
            trip = null
            error = if (e.code() == 404) "分享链接无效" else "加载失败"
        } catch (_: Exception) {
            trip = null
            error = "网络异常，请稍后重试"
        }
    }

    // token 变化时加载
    LaunchedEffect(token) {
        val tk = token ?: return@LaunchedEffect
        trip = null
        dayIdx = 0
        load(tk)
    }

    // 协作模式 4s 轮询（对齐 RN）
    LaunchedEffect(token, trip?.shareMode) {
        val tk = token ?: return@LaunchedEffect
        if (trip?.shareMode != "collab") return@LaunchedEffect
        while (isActive) {
            delay(4000)
            load(tk)
        }
    }

    fun onJoin() {
        val tk = token ?: return
        scope.launch {
            busy = true
            try {
                val t = ApiClient.trips.joinShare(tk)
                trip = t
                if (t.canEdit == true) onOpenTrip(t.id)
            } catch (_: Exception) {
                error = "加入失败"
            } finally {
                busy = false
            }
        }
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        // 顶栏
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
            Text("打开分享", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        }

        val t = trip
        when {
            token == null || (t == null && error != null) -> {
                ShareLinkInput(
                    error = error,
                    onOpen = { tk -> token = tk },
                )
            }
            t == null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = ZhijingColors.BrandHot)
                }
            }
            else -> {
                ShareTripContent(
                    trip = t,
                    dayIdx = dayIdx,
                    busy = busy,
                    onDaySelect = { dayIdx = it },
                    onJoin = ::onJoin,
                )
            }
        }
    }
}

// ---------- 粘贴链接输入（对齐 RN ShareLinkInput） ----------

@Composable
private fun ShareLinkInput(error: String?, onOpen: (String) -> Unit) {
    var link by remember { mutableStateOf("") }
    val parsed = extractShareToken(link)

    Column(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(24.dp))
        Text("打开分享链接", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        Spacer(Modifier.height(6.dp))
        Text(
            "粘贴好友发来的行程链接，即可预览或加入共同编辑",
            fontSize = 13.sp,
            color = ZhijingColors.Muted,
        )
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = link,
            onValueChange = { link = it },
            placeholder = { Text("粘贴链接，如 http://…/share/abc123") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = ZhijingColors.BrandHot,
                unfocusedBorderColor = ZhijingColors.Line,
                focusedContainerColor = ZhijingColors.Card,
                unfocusedContainerColor = ZhijingColors.Card,
            ),
        )
        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, fontSize = 13.sp, color = ZhijingColors.Danger)
        }
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = { parsed?.let(onOpen) },
            enabled = parsed != null,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZhijingColors.Brand),
        ) {
            Text("打开行程", fontSize = 15.sp)
        }
    }
}

// ---------- 共享行程内容 ----------

@Composable
private fun ShareTripContent(
    trip: Trip,
    dayIdx: Int,
    busy: Boolean,
    onDaySelect: (Int) -> Unit,
    onJoin: () -> Unit,
) {
    val collab = trip.shareMode == "collab"
    val days = trip.days
    val day = days.getOrNull(dayIdx) ?: days.firstOrNull()
    val items = day?.items.orEmpty().filter { it.selected }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        // 徽章 + 标题 + 元信息
        Box(
            Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(ZhijingColors.BrandSoft)
                .padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
            Text(if (collab) "共同编辑邀请" else "分享攻略", fontSize = 12.sp, color = ZhijingColors.BrandHot)
        }
        Spacer(Modifier.height(8.dp))
        Text(trip.title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        Spacer(Modifier.height(4.dp))
        Text(
            "${trip.destination} · ${trip.startDate} → ${trip.endDate} · ${trip.travelers}人",
            fontSize = 13.sp,
            color = ZhijingColors.Muted,
        )

        // 协作者
        if (!trip.collaborators.isNullOrEmpty()) {
            Spacer(Modifier.height(10.dp))
            CollaboratorsRow(trip.collaborators)
        }

        // 加入共同编辑
        if (collab) {
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = onJoin,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ZhijingColors.Brand),
            ) {
                if (busy) {
                    CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp, color = ZhijingColors.Card)
                } else {
                    Text(
                        if (trip.canEdit == true) "进入编辑" else "加入共同编辑",
                        fontSize = 15.sp,
                    )
                }
            }
        }

        // 天数切换
        Spacer(Modifier.height(14.dp))
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            days.forEachIndexed { i, d ->
                val on = i == dayIdx
                Box(
                    Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (on) ZhijingColors.Brand else ZhijingColors.Card)
                        .clickable { onDaySelect(i) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text(
                        "Day ${d.dayIndex}",
                        fontSize = 13.sp,
                        color = if (on) ZhijingColors.Card else ZhijingColors.Ink,
                    )
                }
            }
        }

        day?.summary?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, fontSize = 13.sp, color = ZhijingColors.Muted)
        }

        // 点位列表
        Spacer(Modifier.height(12.dp))
        items.forEach { it ->
            val badge = typeBadge(it.type)
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(ZhijingColors.Card)
                    .padding(12.dp),
            ) {
                Box(Modifier.clip(RoundedCornerShape(6.dp)).background(badge.bg).padding(horizontal = 6.dp, vertical = 2.dp)) {
                    Text(
                        "${TYPE_LABEL[it.type] ?: it.type} · ${SLOT_LABEL[it.timeSlot] ?: it.timeSlot}",
                        fontSize = 11.sp,
                        color = badge.fg,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(it.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
                it.description?.trim()?.takeIf { d -> d.isNotEmpty() }?.let { d ->
                    Spacer(Modifier.height(4.dp))
                    Text(d, fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        // 地图
        if (items.any { it.location != null }) {
            Spacer(Modifier.height(4.dp))
            Text("地图", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(8.dp))
            MapHeader(items = items, height = 220.dp)
        }
        Spacer(Modifier.height(24.dp))
    }
}
