package com.travelguide.app.ui.screens.trip

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.model.Collaborator
import com.travelguide.app.data.model.HotelCandidate
import com.travelguide.app.data.model.RouteOption
import com.travelguide.app.ui.theme.ZhijingColors

// ---------- 标签常量（对齐 RN constants.ts / itemCover.ts） ----------

val TYPE_LABEL = mapOf(
    "attraction" to "景点",
    "meal" to "餐饮",
    "hotel" to "住宿",
    "transport" to "交通",
)

val SLOT_LABEL = mapOf(
    "morning" to "上午",
    "afternoon" to "下午",
    "evening" to "晚上",
)

data class TypeBadge(val bg: Color, val fg: Color)

fun typeBadge(type: String): TypeBadge = when (type) {
    "attraction" -> TypeBadge(Color(0xFFE8F5E9), Color(0xFF2E7D32))
    "meal" -> TypeBadge(Color(0xFFFFF3E0), Color(0xFFE65100))
    "hotel" -> TypeBadge(Color(0xFFE3F2FD), Color(0xFF1565C0))
    "transport" -> TypeBadge(Color(0xFFF3E5F5), Color(0xFF6A1B9A))
    else -> TypeBadge(Color(0xFFF5F5F5), ZhijingColors.Ink)
}

data class TypeCover(val emoji: String, val bg: Color)

fun typeCover(type: String): TypeCover = when (type) {
    "attraction" -> TypeCover("🏛", Color(0xFFDCEFE0))
    "meal" -> TypeCover("🍜", Color(0xFFFFE8CC))
    "hotel" -> TypeCover("🛏", Color(0xFFDBEAFE))
    "transport" -> TypeCover("🚌", Color(0xFFEDE9FE))
    else -> TypeCover("📍", Color(0xFFEEF2F7))
}

// ---------- 天数切换条 ----------

/** activeDay = [TRIP_OVERVIEW_TAB] 表示全程总览 */
const val TRIP_OVERVIEW_TAB = -1

@Composable
fun DayTabs(
    days: List<com.travelguide.app.data.model.Day>,
    activeDay: Int,
    onSelect: (Int) -> Unit,
    showOverview: Boolean = true,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        days.forEachIndexed { i, d ->
            val on = i == activeDay
            Box(
                Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (on) ZhijingColors.BrandHot else ZhijingColors.Card)
                    .clickable { onSelect(i) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text(
                    "Day ${d.dayIndex} · ${d.city ?: d.date.takeLast(5)}",
                    fontSize = 13.sp,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (on) Color.White else ZhijingColors.Ink,
                )
            }
        }
        if (showOverview) {
            val on = activeDay == TRIP_OVERVIEW_TAB
            Box(
                Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (on) ZhijingColors.BrandHot else ZhijingColors.Card)
                    .clickable { onSelect(TRIP_OVERVIEW_TAB) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Text(
                    "总览",
                    fontSize = 13.sp,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (on) Color.White else ZhijingColors.Ink,
                )
            }
        }
    }
}

/** 全程总览：统计 + 按天分组的精选地点 */
@Composable
fun TripOverviewSection(
    trip: com.travelguide.app.data.model.Trip,
    days: List<com.travelguide.app.data.model.Day>,
    onSelectDay: (Int) -> Unit,
    onItemClick: (String) -> Unit,
) {
    val allSelected = days.flatMap { it.items }.filter { it.selected }
    val cities = days.mapNotNull { it.city?.takeIf { c -> c.isNotBlank() } }.distinct()
    val spotCount = allSelected.count { it.type != "transport" }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(ZhijingColors.BrandSoft)
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Column {
                Text("全程总览", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
                Spacer(Modifier.height(6.dp))
                Text(
                    buildString {
                        append("共 ${days.size} 天")
                        append(" · ${spotCount} 个地点")
                        if (cities.isNotEmpty()) append(" · ${cities.joinToString("、")}")
                        append(" · ${trip.travelers} 人")
                    },
                    fontSize = 13.sp,
                    color = ZhijingColors.Muted,
                    lineHeight = 20.sp,
                )
            }
        }

        days.forEachIndexed { dayIndex, day ->
            val daySpots = day.items.filter { it.selected && it.type != "transport" }
            if (daySpots.isEmpty()) return@forEachIndexed
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(ZhijingColors.Card)
                    .clickable { onSelectDay(dayIndex) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Day ${day.dayIndex}${day.city?.let { " · $it" } ?: ""}",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZhijingColors.Ink,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "${daySpots.size} 处 ›",
                        fontSize = 12.sp,
                        color = ZhijingColors.BrandHot,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Text(
                    day.date.takeLast(5),
                    fontSize = 11.sp,
                    color = ZhijingColors.Muted,
                    modifier = Modifier.padding(top = 2.dp, bottom = 8.dp),
                )
                daySpots.take(4).forEach { item ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onItemClick(item.id) }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val badge = typeBadge(item.type)
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(badge.bg)
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        ) {
                            Text(
                                TYPE_LABEL[item.type] ?: item.type,
                                fontSize = 10.sp,
                                color = badge.fg,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(
                            item.name,
                            fontSize = 13.sp,
                            color = ZhijingColors.Ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (daySpots.size > 4) {
                    Text(
                        "还有 ${daySpots.size - 4} 处，点击查看当天 ›",
                        fontSize = 11.sp,
                        color = ZhijingColors.Muted,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

// ---------- 路线方案切换 ----------

@Composable
fun RouteOptionsBar(
    options: List<RouteOption>,
    selectedId: String?,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        SectionTitle("路线方案")
        Spacer(Modifier.height(8.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { opt ->
                val on = opt.id == selectedId
                Box(
                    Modifier
                        .clip(RoundedCornerShape(18.dp))
                        .background(
                            if (on) ZhijingColors.BrandSoft else ZhijingColors.BgSurface,
                        )
                        .clickable(enabled = enabled && !on) { onSelect(opt.id) }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                ) {
                    Text(
                        opt.title.ifEmpty { opt.theme },
                        fontSize = 13.sp,
                        color = if (on) ZhijingColors.BrandHot else ZhijingColors.Ink,
                        fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
        }
    }
}

// ---------- 当天操作头 ----------

/** 当天操作：重新生成 / AI 重新规划；编辑态追加「＋ 添加地点」 */
@Composable
fun DayHeadActions(
    busy: Boolean,
    editing: Boolean,
    onRegenDay: () -> Unit,
    onReplanDay: () -> Unit,
    onAddSpot: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        HeadLink(if (busy) "处理中…" else "重新生成当天", enabled = !busy, onClick = onRegenDay)
        HeadLink("AI 重新规划", enabled = !busy, onClick = onReplanDay)
        if (editing) HeadLink("＋ 添加地点", enabled = !busy, onClick = onAddSpot)
    }
}

/** 底部浮动按钮统一高度，保证「AI / 编辑 / 更多」三者顶部与底部对齐 */
val FabHeight = 56.dp

/** 右下角浮动「编辑」入口：非编辑态切换进编辑，编辑态显示「完成」 */
@Composable
fun EditFab(
    editing: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier
            .height(FabHeight)
            .shadow(6.dp, CircleShape)
            .clip(CircleShape)
            .background(if (editing) ZhijingColors.BrandHot else ZhijingColors.BrandSoft)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (editing) "完成" else "编辑",
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = if (editing) Color.White else ZhijingColors.BrandHot,
        )
    }
}

/** 左下角浮动「问 AI 助手」入口 */
@Composable
fun AskAiFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(FabHeight)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(ZhijingColors.BrandHot)
            .clickable(onClick = onClick)
            .padding(horizontal = 52.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "问 AI 助手",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
    }
}

@Composable
private fun HeadLink(text: String, enabled: Boolean, onClick: () -> Unit) {
    Text(
        text,
        fontSize = 13.sp,
        color = if (enabled) ZhijingColors.BrandHot else ZhijingColors.Muted,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 4.dp, horizontal = 2.dp),
    )
}

// ---------- 右下角「更多」圆钮（分享 / 导出 / 分账 / 发帖） ----------

/** 右下角浮动圆钮：三个竖点，点开由页面渲染玻璃面板 */
@Composable
fun MoreFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(FabHeight)
            .shadow(6.dp, CircleShape)
            .clip(CircleShape)
            .background(ZhijingColors.BrandSoft)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            repeat(3) {
                Box(
                    Modifier
                        .size(4.dp)
                        .clip(CircleShape)
                        .background(ZhijingColors.BrandHot),
                )
            }
        }
    }
}

/** 「更多」玻璃面板：白→淡蓝的半透明磨砂渐变 + 白色描边 + 22dp 圆角 */
@Composable
fun MoreMenuPanel(items: List<Pair<String, () -> Unit>>, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier
            .width(188.dp)
            .shadow(18.dp, shape)
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color.White.copy(alpha = 0.95f),
                        Color(0xFFDFF2FE).copy(alpha = 0.88f),
                    ),
                ),
            )
            .border(1.dp, Color.White.copy(alpha = 0.9f), shape)
            .padding(vertical = 6.dp),
    ) {
        items.forEach { (label, action) ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClick = action)
                    .padding(horizontal = 20.dp, vertical = 13.dp),
            ) {
                Text(label, fontSize = 14.sp, color = ZhijingColors.Ink)
            }
        }
    }
}

// ---------- 预算估算 ----------

@Composable
fun BudgetSection(budgetByType: Map<String, Double>, travelers: Int, totalBudget: Double) {
    if (budgetByType.isEmpty()) return
    val totalCost = budgetByType.values.sum()
    Column(Modifier.fillMaxWidth()) {
        SectionTitle("预算估算")
        Spacer(Modifier.height(6.dp))
        budgetByType.forEach { (type, cost) ->
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                Text(TYPE_LABEL[type] ?: type, fontSize = 13.sp, color = ZhijingColors.Muted)
                Spacer(Modifier.weight(1f))
                Text("¥${cost.toLong()}", fontSize = 13.sp)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "人均 ¥${Math.round(totalCost)} × $travelers",
                fontSize = 12.sp,
                color = ZhijingColors.Muted,
            )
            Spacer(Modifier.weight(1f))
            Text(
                "¥${Math.round(totalBudget)}",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = ZhijingColors.BrandHot,
            )
        }
    }
}

// ---------- 酒店推荐 + 外部参考 ----------

@Composable
fun HotelNotesSection(
    destination: String,
    status: String?,
    candidates: List<HotelCandidate>?,
) {
    if (candidates.isNullOrEmpty() && status != "loading") return
    val context = LocalContext.current
    Column(Modifier.fillMaxWidth()) {
        SectionTitle("酒店参考")
        Spacer(Modifier.height(6.dp))
        if (candidates.isNullOrEmpty()) {
            Text("正在抓取 $destination 的酒店信息…", fontSize = 12.sp, color = ZhijingColors.Muted)
        } else {
            candidates.forEach { h ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(ZhijingColors.BgSurface)
                        .clickable {
                            if (h.url.isNotBlank()) {
                                try {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(h.url)))
                                } catch (_: Exception) {
                                }
                            }
                        }
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(h.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(
                                h.goodRate?.let { "好评 ${it.toLong()}%" },
                                h.metroDistanceM?.let { "距地铁 ${Math.round(it / 100.0) * 100}m" },
                                h.nearestAttraction?.let { "近$it" },
                            ).joinToString(" · "),
                            fontSize = 12.sp,
                            color = ZhijingColors.Muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    h.score?.let {
                        Text(
                            String.format("%.1f", it),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZhijingColors.BrandHot,
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

// ---------- 协作者 ----------

@Composable
fun CollaboratorsRow(collaborators: List<Collaborator>) {
    if (collaborators.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().padding(top = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("一起编辑：", fontSize = 12.sp, color = ZhijingColors.Muted)
        collaborators.forEach { c ->
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(ZhijingColors.BrandSoft)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    c.username + if (c.role == "owner") "（发起人）" else "",
                    fontSize = 12.sp,
                    color = ZhijingColors.BrandHot,
                )
            }
        }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium)
}
