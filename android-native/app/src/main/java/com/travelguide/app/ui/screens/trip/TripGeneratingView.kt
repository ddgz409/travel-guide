package com.travelguide.app.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.model.Trip
import com.travelguide.app.ui.components.MapHeader
import com.travelguide.app.ui.theme.ZhijingColors

/** 与 RN 版 TripGeneratingView 一致的阶段步骤 */
private val PHASES = listOf(
    "geocode" to "定位目的地",
    "poi" to "检索景点美食",
    "refs" to "整理参考链接",
    "llm" to "AI 规划路线",
    "save" to "整理方案",
)

/**
 * 生成中视图：地图 + 阶段步骤 + AI 流式输出（对齐 RN 版 TripGeneratingView，
 * RN 用全屏地图+抽屉，这里用上下布局承载相同信息）。
 */
@Composable
fun TripGeneratingView(
    trip: Trip,
    message: String,
    readable: String,
    phase: String,
    streaming: Boolean,
    onBack: () -> Unit,
) {
    val phaseIdx = PHASES.indexOfFirst { it.first == phase }
    val scrollState = rememberScrollState()

    // 流式文本自动滚到底部
    LaunchedEffect(readable, message) {
        scrollState.scrollTo(scrollState.maxValue)
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
            Column(Modifier.weight(1f)) {
                Text("规划行程", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
                Text(
                    "${trip.destination} · AI 正在为你规划",
                    fontSize = 12.sp,
                    color = ZhijingColors.Muted,
                )
            }
        }

        // 地图：等第一天的点位落地后再展示（避免无坐标时默认展示北京）
        val firstDayPois = trip.days.firstOrNull()?.items.orEmpty().filter { it.location != null }
        if (firstDayPois.isNotEmpty()) {
            MapHeader(
                items = firstDayPois,
                height = 200.dp,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        } else {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(ZhijingColors.Card),
                contentAlignment = Alignment.Center,
            ) {
                Text("正在定位目的地…", fontSize = 13.sp, color = ZhijingColors.Muted)
            }
        }

        Spacer(Modifier.height(12.dp))

        // 阶段步骤条
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            PHASES.forEachIndexed { i, p ->
                val done = phaseIdx > i
                val active = phaseIdx == i || (phaseIdx < 0 && i == 0)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier
                            .size(10.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(
                                when {
                                    done -> ZhijingColors.Ready
                                    active -> ZhijingColors.BrandHot
                                    else -> ZhijingColors.Line
                                },
                            ),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        p.second,
                        fontSize = 10.sp,
                        color = if (done || active) ZhijingColors.Ink else ZhijingColors.Muted,
                    )
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // AI 输出气泡
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(ZhijingColors.Card)
                .padding(14.dp),
        ) {
            Text("知径 AI", fontSize = 12.sp, color = ZhijingColors.Muted)
            Spacer(Modifier.height(4.dp))
            Text(
                message.ifBlank { "准备中…" },
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = ZhijingColors.Ink,
            )
            Spacer(Modifier.height(8.dp))
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(scrollState),
            ) {
                if (readable.isNotBlank()) {
                    Text(readable, fontSize = 13.sp, color = ZhijingColors.Ink, lineHeight = 20.sp)
                    if (streaming) Text("▍", fontSize = 13.sp, color = ZhijingColors.BrandHot)
                } else if (streaming) {
                    Text("正在输出规划内容…", fontSize = 13.sp, color = ZhijingColors.Muted)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}
