package com.travelguide.app.ui.screens.trip

import android.content.Intent
import androidx.compose.foundation.background
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

@Composable
fun DayTabs(
    days: List<com.travelguide.app.data.model.Day>,
    activeDay: Int,
    onSelect: (Int) -> Unit,
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

@Composable
fun DayHeadActions(
    busy: Boolean,
    editing: Boolean,
    onRegenDay: () -> Unit,
    onReplanDay: () -> Unit,
    onAddSpot: () -> Unit,
    onToggleEdit: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HeadLink(if (busy) "处理中…" else "重新生成当天", enabled = !busy, onClick = onRegenDay)
            HeadLink("AI 重新规划", enabled = !busy, onClick = onReplanDay)
        }
        Spacer(Modifier.height(8.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HeadButton("＋ 添加地点", enabled = !busy, onClick = onAddSpot, modifier = Modifier.weight(1f))
            HeadButton(
                text = if (editing) "完成" else "编辑",
                enabled = !busy,
                onClick = onToggleEdit,
                active = editing,
                modifier = Modifier.weight(1f),
            )
        }
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

@Composable
private fun HeadButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
    active: Boolean = false,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(
                when {
                    active -> ZhijingColors.BrandHot
                    enabled -> ZhijingColors.BrandSoft
                    else -> ZhijingColors.Line
                },
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (active) Color.White else ZhijingColors.BrandHot,
        )
    }
}

// ---------- 分享横幅 + 操作按钮行 ----------

@Composable
fun ShareBanner(shareMsg: String?, busy: Boolean, onShare: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.BrandSoft)
            .clickable(enabled = !busy, onClick = onShare)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("分享链接", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(
                shareMsg ?: "邀请好友一起编辑这条行程 · 复制链接",
                fontSize = 12.sp,
                color = ZhijingColors.Muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            if (busy) "…" else "分享",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = ZhijingColors.BrandHot,
        )
    }
}

@Composable
fun ActionsRow(
    shareToken: String?,
    busy: Boolean,
    onAskAi: () -> Unit,
    onOpenSharePage: (String) -> Unit,
    onTodoFeature: (String) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ActionChip("问 AI 助手", hot = true) { onAskAi() }
        ActionChip("导出 PDF", enabled = !busy) { onTodoFeature("导出 PDF") }
        ActionChip("一键发帖") { onTodoFeature("一键发帖") }
        ActionChip("AA 分账") { onTodoFeature("AA 分账") }
        if (shareToken != null) {
            ActionChip("打开分享页") { onOpenSharePage(shareToken) }
        }
    }
}

@Composable
private fun ActionChip(text: String, hot: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (hot) ZhijingColors.BrandSoft else ZhijingColors.BgSurface)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    ) {
        Text(
            text,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = if (hot) ZhijingColors.BrandHot else ZhijingColors.Ink,
        )
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
