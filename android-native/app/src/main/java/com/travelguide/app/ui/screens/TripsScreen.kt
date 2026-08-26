package com.travelguide.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.model.TripListItem
import com.travelguide.app.data.model.landmarksFor
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** 大卡片马卡龙色（对齐 RN pastels） */
private val PASTELS = listOf(
    Color(0xFFE8E4F8), // 淡紫
    Color(0xFFD7EAF8), // 淡蓝
    Color(0xFFE4F0D8), // 淡绿
    Color(0xFFF8E8D8), // 杏色
    Color(0xFFF5E0EC), // 藕粉
)

private enum class PhaseTone { DONE, LIVE, SOON, BUSY, FAIL }

private data class TripPhase(val label: String, val tone: PhaseTone)

/**
 * 我的行程（对齐 RN TripsScreen）：
 * 大标题 + 分享链接入口 + 马卡龙色行程卡（状态徽章 / 日期侧条 / 头像组 / 旋转封面图）。
 */
@Composable
fun TripsScreen(
    onOpenTrip: (String) -> Unit,
    onOpenGenerate: () -> Unit,
    onOpenShare: () -> Unit,
) {
    var trips by remember { mutableStateOf<List<TripListItem>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            trips = null
            error = null
            try {
                trips = ApiClient.trips.list()
            } catch (e: Exception) {
                error = "加载失败：${e.message}"
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(top = 44.dp)) {
        Text(
            "我的行程",
            fontSize = 28.sp,
            fontWeight = FontWeight.ExtraBold,
            color = ZhijingColors.Ink,
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 12.dp),
        )
        when {
            error != null -> Column(
                Modifier.fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(error!!, fontSize = 15.sp, color = Color(0xFFC62828), textAlign = TextAlign.Center)
                Spacer(Modifier.height(16.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(ZhijingColors.BrandSoft)
                        .clickable { load() }
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                ) {
                    Text("重试", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.BrandHot)
                }
            }
            trips == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
            trips!!.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "还没有行程，点底部「＋」开始规划",
                    fontSize = 15.sp,
                    color = ZhijingColors.Muted,
                    textAlign = TextAlign.Center,
                )
            }
            else -> {
                val sorted = remember(trips) {
                    trips!!.sortedByDescending { parseDay(it.startDate)?.toEpochDay() ?: 0L }
                }
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = 16.dp, end = 16.dp, bottom = 24.dp,
                    ),
                ) {
                    itemsIndexed(sorted, key = { _, t -> t.id }) { index, trip ->
                        TripCard(
                            item = trip,
                            index = index,
                            modifier = Modifier.padding(bottom = 14.dp),
                            onPress = { onOpenTrip(trip.id) },
                        )
                    }
                }
            }
        }
    }
}

/** 行程卡片（对齐 RN TripCard：40 圆角马卡龙卡 + 徽章 + 侧条元信息 + 头像组 + 封面） */
@Composable
private fun TripCard(item: TripListItem, index: Int, modifier: Modifier = Modifier, onPress: () -> Unit) {
    val bg = PASTELS[index % PASTELS.size]
    val phase = tripPhase(item)
    val (days, nights) = daysNights(item.startDate, item.endDate)
    val travelers = maxOf(1, item.travelers)
    val initial = item.destination.ifBlank { "旅" }.take(1)
    val landmark = landmarksFor(item.destination).firstOrNull() ?: item.destination

    Box(
        modifier
            .fillMaxWidth()
            .shadow(8.dp, RoundedCornerShape(40.dp))
            .clip(RoundedCornerShape(40.dp))
            .background(bg)
            .clickable(onClick = onPress),
    ) {
        Column(
            Modifier.padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 18.dp),
        ) {
            // 状态徽章：白胶囊 + 彩色圆点
            Row(
                Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White.copy(alpha = 0.92f))
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(6.dp).clip(RoundedCornerShape(3.dp)).background(phase.dotColor()))
                Spacer(Modifier.width(6.dp))
                Text(phase.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Muted)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                item.title.ifBlank { "${item.destination}行程" },
                fontSize = 24.sp,
                fontWeight = FontWeight.ExtraBold,
                color = ZhijingColors.Ink,
                lineHeight = 32.sp,
                maxLines = 2,
                modifier = Modifier.fillMaxWidth(0.72f),
            )
            Spacer(Modifier.height(12.dp))
            // 元信息：橙色竖条 + 两行
            Row(Modifier.fillMaxWidth(0.68f)) {
                Box(
                    Modifier
                        .width(2.dp)
                        .height(38.dp)
                        .clip(RoundedCornerShape(1.dp))
                        .background(Color(0xFFFF6D00).copy(alpha = 0.28f)),
                )
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        "${fmtMd(item.startDate)}至${fmtMd(item.endDate)} ${days}天" +
                            if (nights > 0) "${nights}晚" else "",
                        fontSize = 13.sp,
                        color = ZhijingColors.Muted,
                        lineHeight = 20.sp,
                    )
                    Text(
                        item.destination +
                            (if (item.status != "ready") " · ${statusLabel(item.status)}" else "") +
                            (if (travelers > 1) " · ${travelers}人" else ""),
                        fontSize = 13.sp,
                        color = ZhijingColors.Muted,
                        lineHeight = 20.sp,
                    )
                }
            }
            Spacer(Modifier.height(18.dp))
            // 头像组（首位是发起人首字，其余为序号）
            Row {
                repeat(minOf(travelers, 3)) { i ->
                    Box(
                        Modifier
                            .offset(x = if (i == 0) 0.dp else (-10).dp * i)
                            .size(34.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .border(2.dp, Color.White.copy(alpha = 0.9f), RoundedCornerShape(14.dp))
                            .background(if (i == 0) ZhijingColors.Brand else Color(0xFFE07A3A)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (i == 0) initial else "${i + 1}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White,
                        )
                    }
                }
            }
        }
        // 封面：右下角旋转 14° 的城市地标图（对齐 RN coverWrap）
        TripCover(
            city = item.destination,
            landmark = landmark,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .offset(x = 6.dp, y = 18.dp)
                .size(132.dp)
                .rotate(14f),
        )
    }
}

@Composable
private fun TripCover(city: String, landmark: String, modifier: Modifier = Modifier) {
    val url = rememberPlaceImage(city, landmark.ifBlank { city }, "spots")
    Box(
        modifier
            .clip(RoundedCornerShape(32.dp))
            .background(Color.White.copy(alpha = 0.35f)),
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = landmark,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }
    }
}

// ---------- 日期与状态工具（对齐 RN Trips/helpers.ts） ----------

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

private fun tripPhase(item: TripListItem): TripPhase {
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
    PhaseTone.LIVE -> Color(0xFF2E7D32)
    PhaseTone.BUSY -> Color(0xFFEF6C00)
    PhaseTone.FAIL -> Color(0xFFC62828)
    PhaseTone.SOON -> ZhijingColors.Brand
    PhaseTone.DONE -> ZhijingColors.Brand
}

private fun statusLabel(s: String): String = when (s) {
    "ready" -> "已完成"
    "generating" -> "生成中"
    else -> "失败"
}
