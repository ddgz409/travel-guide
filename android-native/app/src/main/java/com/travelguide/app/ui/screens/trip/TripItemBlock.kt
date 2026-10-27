package com.travelguide.app.ui.screens.trip

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.ItemTogglePayload
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.model.Location
import com.travelguide.app.data.model.Trip
import com.travelguide.app.data.model.TransportToNext
import com.travelguide.app.ui.components.TransportRouteSheet
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

/** 单条行程项详情块（对齐 RN ItemBlock：取消/恢复 + 换一个） */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TripItemBlock(
    item: Item,
    tripId: String,
    destination: String,
    canEdit: Boolean,
    hasNextRoute: Boolean,
    onChanged: (Trip) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var localTransport by remember { mutableStateOf(item.transportToNext) }
    val alts = item.alternatives.orEmpty()
    val showRouteBtn = item.selected && hasNextRoute && hasCoords(item.location)
    val transportForSheet = localTransport ?: item.transportToNext ?: if (showRouteBtn) ROUTE_STUB else null

    LaunchedEffect(item.transportToNext) {
        localTransport = item.transportToNext
    }

    fun toggle() {
        if (!canEdit || busy) return
        busy = true
        scope.launch {
            runCatching {
                ApiClient.trips.toggleItem(tripId, item.id, ItemTogglePayload(!item.selected))
            }.fold(
                onSuccess = onChanged,
                onFailure = { Toast.makeText(context, it.message ?: "操作失败", Toast.LENGTH_SHORT).show() },
            )
            busy = false
        }
    }

    fun swap(altIndex: Int) {
        if (!canEdit || busy) return
        busy = true
        scope.launch {
            runCatching { ApiClient.trips.swapItem(tripId, item.id, altIndex) }.fold(
                onSuccess = onChanged,
                onFailure = { Toast.makeText(context, it.message ?: "换一个失败", Toast.LENGTH_SHORT).show() },
            )
            busy = false
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .alpha(if (item.selected) 1f else 0.55f)
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .padding(16.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                "${TYPE_LABEL[item.type] ?: item.type} · ${SLOT_LABEL[item.timeSlot] ?: item.timeSlot}",
                fontSize = 12.sp,
                color = ZhijingColors.Muted,
            )
            if (canEdit) {
                Text(
                    if (item.selected) "取消" else "恢复",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = ZhijingColors.BrandHot,
                    modifier = Modifier.clickable(enabled = !busy) { toggle() },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(item.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        item.description?.trim()?.takeIf { it.isNotEmpty() }?.let { desc ->
            Spacer(Modifier.height(8.dp))
            Text(desc, fontSize = 14.sp, color = ZhijingColors.Ink, lineHeight = 20.sp)
        }
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            item.durationMin?.let {
                Text("$it 分钟", fontSize = 12.sp, color = ZhijingColors.Muted)
            }
            item.cost?.let {
                Text("¥$it", fontSize = 12.sp, color = ZhijingColors.Muted)
            }
            item.rating?.let {
                Text("评分 $it", fontSize = 12.sp, color = ZhijingColors.Muted)
            }
        }
        if (showRouteBtn && transportForSheet != null) {
            Spacer(Modifier.height(10.dp))
            TransportRouteSheet(
                tripId = tripId,
                itemId = item.id,
                fromName = item.name,
                transport = transportForSheet,
                onUpdated = { localTransport = it },
            )
        }
        if (canEdit && alts.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Text("换一个：", fontSize = 13.sp, color = ZhijingColors.Muted)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                alts.take(3).forEachIndexed { i, alt ->
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(ZhijingColors.BrandSoft)
                            .clickable(enabled = !busy) { swap(i) }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Text(alt.name, fontSize = 13.sp, color = ZhijingColors.BrandHot, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        if (busy) {
            Spacer(Modifier.height(12.dp))
            CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = ZhijingColors.BrandHot, strokeWidth = 2.dp)
        }
    }
}

private val ROUTE_STUB = TransportToNext(mode = "transit")

private fun hasCoords(loc: Location?): Boolean = loc != null
