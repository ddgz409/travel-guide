package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.model.landmarksFor
import com.travelguide.app.ui.theme.ZhijingColors
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Agent 查行程时的摘要（对齐 RN AgentTripSummary） */
data class AgentTripSummary(
    val tripId: String,
    val title: String,
    val destination: String,
    val startDate: String,
    val endDate: String,
    val travelers: Int,
    val status: String,
)

fun JsonObject.toAgentTrip(): AgentTripSummary? {
    val id = this["trip_id"]?.jsonPrimitive?.contentOrNull
        ?: this["id"]?.jsonPrimitive?.contentOrNull
        ?: return null
    return AgentTripSummary(
        tripId = id,
        title = this["title"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        destination = this["destination"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        startDate = this["start_date"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        endDate = this["end_date"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        travelers = this["travelers"]?.jsonPrimitive?.intOrNull ?: 1,
        status = this["status"]?.jsonPrimitive?.contentOrNull.orEmpty(),
    )
}

fun List<JsonObject>.toAgentTrips(): List<AgentTripSummary> =
    mapNotNull { it.toAgentTrip() }

private val PASTELS = listOf(
    Color(0xFFE8E4F8),
    Color(0xFFFFE8D6),
    Color(0xFFD7EAF8),
    Color(0xFFE4F0D8),
    Color(0xFFF5E0EC),
)

private enum class PhaseTone { LIVE, BUSY, FAIL, SOON, DONE }

private data class TripPhase(val label: String, val tone: PhaseTone)

private fun parseDay(s: String): LocalDate? =
    runCatching { LocalDate.parse(s.take(10)) }.getOrNull()

private fun fmtMd(s: String): String {
    val d = parseDay(s) ?: return s
    return "${d.monthValue}月${d.dayOfMonth}日"
}

private fun daysNights(start: String, end: String): Pair<Int, Int> {
    val a = parseDay(start)
    val b = parseDay(end)
    if (a == null || b == null) return 1 to 0
    val days = maxOf(1, ChronoUnit.DAYS.between(a, b).toInt() + 1)
    return days to maxOf(0, days - 1)
}

private fun tripPhase(item: AgentTripSummary): TripPhase {
    if (item.status == "generating") return TripPhase("生成中", PhaseTone.BUSY)
    if (item.status == "failed") return TripPhase("生成失败", PhaseTone.FAIL)
    val now = LocalDate.now()
    val start = parseDay(item.startDate)
    val end = parseDay(item.endDate)
    if (end != null && end < now) return TripPhase("行程已结束", PhaseTone.DONE)
    if (start != null && end != null && !now.isBefore(start) && !now.isAfter(end)) {
        return TripPhase("行程进行中", PhaseTone.LIVE)
    }
    return TripPhase("即将出发", PhaseTone.SOON)
}

private fun TripPhase.dotColor(): Color = when (tone) {
    PhaseTone.LIVE -> Color(0xFF22C55E)
    PhaseTone.BUSY -> ZhijingColors.Brand
    PhaseTone.FAIL -> ZhijingColors.Danger
    PhaseTone.SOON -> Color(0xFFF59E0B)
    PhaseTone.DONE -> ZhijingColors.Muted
}

/** Agent 查行程列表时的卡片弹窗（对齐 RN TripListSheet） */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripListSheet(
    visible: Boolean,
    trips: List<AgentTripSummary>,
    message: String? = null,
    onClose: () -> Unit,
    onSelect: (String) -> Unit,
) {
    if (!visible) return
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var localTrips by remember(trips) { mutableStateOf(trips) }
    var filterText by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<AgentTripSummary?>(null) }

    LaunchedEffect(trips) { localTrips = trips }

    val kw = filterText.trim().lowercase()
    val filtered = if (kw.isEmpty()) {
        localTrips
    } else {
        localTrips.filter {
            it.title.lowercase().contains(kw) || it.destination.lowercase().contains(kw)
        }
    }

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheetState,
        containerColor = ZhijingColors.Card,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Box(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .width(36.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFE6E6E6)),
            )
            Spacer(Modifier.height(14.dp))
            Text("我的行程", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
            Text(
                when {
                    localTrips.isEmpty() -> message ?: "暂无行程记录"
                    kw.isNotEmpty() -> "筛选出 ${filtered.size} / 共 ${localTrips.size} 条，点击查看详情"
                    else -> "共 ${localTrips.size} 条，点击查看详情"
                },
                fontSize = 13.sp,
                color = ZhijingColors.Muted,
                modifier = Modifier.padding(top = 6.dp, bottom = 14.dp),
            )

            if (localTrips.isNotEmpty()) {
                OutlinedTextField(
                    value = filterText,
                    onValueChange = { filterText = it },
                    placeholder = { Text("搜索目的地或标题", color = Color(0xFF9CA3AF)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = {
                        if (filterText.isNotEmpty()) {
                            Text(
                                "✕",
                                modifier = Modifier
                                    .clickable { filterText = "" }
                                    .padding(8.dp),
                                color = ZhijingColors.Muted,
                            )
                        }
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFFF3F4F6),
                        unfocusedContainerColor = Color(0xFFF3F4F6),
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                    ),
                    shape = RoundedCornerShape(14.dp),
                )
                Spacer(Modifier.height(12.dp))
            }

            when {
                localTrips.isEmpty() -> EmptyHint("🧳", message ?: "还没有行程，去首页规划一次吧")
                filtered.isEmpty() -> EmptyHint("🔍", "没有找到匹配「$kw」的行程")
                else -> Column(
                    Modifier
                        .heightIn(max = 420.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    filtered.forEachIndexed { index, item ->
                        TripListCard(
                            item = item,
                            index = index,
                            onClick = {
                                onClose()
                                onSelect(item.tripId)
                            },
                            onDelete = { pendingDelete = item },
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(ZhijingColors.BrandSoft)
                    .clickable(onClick = onClose)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("关闭", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.BrandHot)
            }
        }
    }

    pendingDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除攻略") },
            text = { Text("确定删除「${item.title.ifBlank { "${item.destination}行程" }}」吗？\n此操作不可恢复。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        scope.launch {
                            val ok = runCatching { ApiClient.trips.remove(item.tripId) }.isSuccess
                            if (ok) localTrips = localTrips.filter { it.tripId != item.tripId }
                        }
                    },
                ) { Text("删除", color = ZhijingColors.Danger) }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun EmptyHint(emoji: String, text: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 36.sp)
        Text(
            text,
            fontSize = 14.sp,
            color = ZhijingColors.Muted,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 10.dp),
        )
    }
}

@Composable
private fun TripListCard(
    item: AgentTripSummary,
    index: Int,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    val bg = PASTELS[index % PASTELS.size]
    val phase = tripPhase(item)
    val (days, nights) = daysNights(item.startDate, item.endDate)
    val landmark = landmarksFor(item.destination).firstOrNull() ?: item.destination
    val coverUrl = rememberPlaceImage(item.destination, landmark.ifBlank { item.destination }, "spots")

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(phase.dotColor()),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(phase.label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Muted)
                }
                Text(
                    item.title.ifBlank { "${item.destination}行程" },
                    fontSize = 17.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = ZhijingColors.Ink,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    "${fmtMd(item.startDate)} → ${fmtMd(item.endDate)} · ${days}天" +
                        if (nights > 0) "${nights}晚" else "",
                    fontSize = 12.sp,
                    color = Color(0xB8121212),
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    item.destination + if (item.travelers > 1) " · ${item.travelers}人" else "",
                    fontSize = 12.sp,
                    color = Color(0xB8121212),
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Box(
                Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White.copy(alpha = 0.5f)),
            ) {
                if (coverUrl != null) {
                    AsyncImage(
                        model = coverUrl,
                        contentDescription = landmark,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                }
            }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("点击查看 ›", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.BrandHot)
            Box(
                Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White.copy(alpha = 0.6f))
                    .clickable(onClick = onDelete)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text("删除", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Danger)
            }
        }
    }
}
