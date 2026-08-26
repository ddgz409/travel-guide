package com.travelguide.app.ui.screens.trip

import android.content.Context
import android.os.Build
import android.os.Vibrator
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.model.TransportToNext
import com.travelguide.app.ui.components.PlaceCover
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

// ---------- 常规模式行 ----------

@Composable
fun NormalItemRow(
    item: Item,
    hasNextRoute: Boolean,
    city: String,
    onClick: () -> Unit,
) {
    val badge = typeBadge(item.type)
    val cover = typeCover(item.type)
    val desc = item.description?.trim().orEmpty()
    val showRoute = item.selected && hasNextRoute && item.location != null

    Column(
        Modifier
            .fillMaxWidth()
            .alpha(if (item.selected) 1f else 0.45f)
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .clickable(onClick = onClick)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // 类型封面：优先高德真实图片，无图兜底 emoji（对齐 RN PlaceImage）
            PlaceCover(
                item = item,
                city = city,
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(12.dp)),
                emoji = cover.emoji,
                emojiBg = cover.bg,
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    item.name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        Modifier.clip(RoundedCornerShape(6.dp)).background(badge.bg).padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(TYPE_LABEL[item.type] ?: item.type, fontSize = 11.sp, color = badge.fg)
                    }
                    Box(
                        Modifier.clip(RoundedCornerShape(6.dp)).background(ZhijingColors.BgSurface).padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            buildString {
                                append(SLOT_LABEL[item.timeSlot] ?: item.timeSlot)
                                item.durationMin?.let { append(" · ${it}分钟") }
                            }.ifBlank { "—" },
                            fontSize = 11.sp,
                            color = ZhijingColors.Muted,
                        )
                    }
                }
            }
        }

        if (desc.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(desc, fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }

        if (item.cost != null || item.rating != null) {
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                item.cost?.let { Text("¥${it.toLong()}", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ZhijingColors.BrandHot) }
                item.rating?.let { Text("评分 $it", fontSize = 12.sp, color = ZhijingColors.Muted) }
            }
        }

        if (showRoute && item.transportToNext != null) {
            Spacer(Modifier.height(8.dp))
            TransportChip(item.transportToNext)
        }
    }
}

/** 到下一站的交通摘要（v1：点击展开步骤对话框） */
@Composable
private fun TransportChip(transport: TransportToNext) {
    var showDetail by remember { mutableStateOf(false) }
    val modeEmoji = when (transport.mode) {
        "walking" -> "🚶"
        "driving" -> "🚗"
        "transit" -> "🚌"
        else -> "🚏"
    }
    val minutes = Math.max(1, Math.round(transport.durationS / 60.0)).toLong()

    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(ZhijingColors.BgSurface)
            .clickable { if (transport.detail?.isNotEmpty() == true) showDetail = true }
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Text(
            "$modeEmoji ${Math.round(transport.distanceM / 100.0) * 100}m · 约${minutes}分钟",
            fontSize = 12.sp,
            color = ZhijingColors.Muted,
        )
    }

    if (showDetail) {
        AlertDialog(
            onDismissRequest = { showDetail = false },
            title = { Text("交通方案") },
            text = {
                Column {
                    transport.detail?.forEach { step ->
                        Text(
                            step.instruction ?: step.lineName ?: step.type,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(vertical = 2.dp),
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showDetail = false }) { Text("知道了") } },
        )
    }
}

// ---------- 编辑态：紧凑行 + 拖拽排序列表 ----------

@Composable
fun EditableDayList(
    items: List<Item>,
    dayId: String?,
    busy: Boolean,
    externalItems: List<Item>,
    onRemove: (Item) -> Unit,
    onCommitOrder: suspend (List<Item>) -> Unit,
) {
    var local by remember { mutableStateOf(items) }
    var isDragging by remember { mutableStateOf(false) }
    val vibrator = rememberVibrator()
    val scope = rememberCoroutineScope()

    // 外部数据变化且非拖拽中：以外部为准
    LaunchedEffect(externalItems) {
        if (!isDragging) local = externalItems
    }

    val lazyListState = rememberLazyListState()
    val reorderableState = rememberReorderableLazyListState(lazyListState) { from, to ->
        val fromKey = from.key as? String ?: return@rememberReorderableLazyListState
        val toKey = to.key as? String ?: return@rememberReorderableLazyListState
        local = local.toMutableList().apply {
            val fi = indexOfFirst { it.id == fromKey }
            val ti = indexOfFirst { it.id == toKey }
            if (fi >= 0 && ti >= 0) add(ti, removeAt(fi))
        }
    }

    LazyColumn(
        state = lazyListState,
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(local, key = { it.id }) { item ->
            ReorderableItem(reorderableState, key = item.id) { isItemDragging ->
                val handleModifier = if (!busy && dayId != null) {
                    Modifier.longPressDraggableHandle(
                        onDragStarted = {
                            isDragging = true
                            vibrate(vibrator)
                        },
                        onDragStopped = {
                            isDragging = false
                            vibrate(vibrator)
                            val ordered = local
                            scope.launch { onCommitOrder(ordered) }
                        },
                    )
                } else {
                    Modifier
                }
                CompactRow(
                    item = item,
                    isDragging = isItemDragging,
                    canDrag = !busy && dayId != null,
                    handleModifier = handleModifier,
                    onRemove = { if (item.type != "transport") onRemove(item) },
                )
            }
        }
    }
}

@Composable
private fun CompactRow(
    item: Item,
    isDragging: Boolean,
    canDrag: Boolean,
    handleModifier: Modifier,
    onRemove: () -> Unit,
) {
    val badge = typeBadge(item.type)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .scale(if (isDragging) 1.03f else 1f)
            .graphicsLayer { shadowElevation = if (isDragging) 16f else 0f },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Card(
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = ZhijingColors.Card),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        ) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(item.name, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Box(Modifier.clip(RoundedCornerShape(5.dp)).background(badge.bg).padding(horizontal = 5.dp, vertical = 1.dp)) {
                        Text(TYPE_LABEL[item.type] ?: item.type, fontSize = 10.sp, color = badge.fg)
                    }
                }
                // 删除按钮（transport 不可删）
                if (item.type != "transport") {
                    Box(
                        Modifier
                            .size(30.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ZhijingColors.BgSurface)
                            .clickable(onClick = onRemove)
                            .padding(4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("✕", fontSize = 13.sp, color = ZhijingColors.Danger)
                    }
                }
            }
        }

        Spacer(Modifier.width(8.dp))

        // ≡ 拖拽手柄（仅此区域可发起拖拽）
        Box(
            modifier = Modifier
                .size(44.dp)
                .background(
                    if (canDrag) ZhijingColors.BrandSoft else ZhijingColors.Line,
                    RoundedCornerShape(12.dp),
                )
                .then(handleModifier),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                repeat(3) {
                    Box(
                        Modifier
                            .width(16.dp)
                            .height(2.dp)
                            .padding(vertical = 1.dp)
                            .background(ZhijingColors.BrandHot, RoundedCornerShape(1.dp)),
                    )
                }
            }
        }
    }
}

// ---------- 震动（拖拽反馈） ----------

@Composable
private fun rememberVibrator(): Vibrator? =
    LocalContext.current.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

private fun vibrate(vibrator: Vibrator?) {
    try {
        if (Build.VERSION.SDK_INT >= 26) {
            vibrator?.vibrate(
                android.os.VibrationEffect.createOneShot(15, android.os.VibrationEffect.DEFAULT_AMPLITUDE),
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(15)
        }
    } catch (_: Exception) {
    }
}
