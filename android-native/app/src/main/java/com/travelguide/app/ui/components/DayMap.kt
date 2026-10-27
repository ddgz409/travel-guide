package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.util.polylinesFromItems
import com.travelguide.app.data.util.routeItemMarkers
import com.travelguide.app.ui.navigation.MapMarkerNav
import com.travelguide.app.ui.theme.ZhijingColors

/**
 * 分享页日地图：路线折线 + 点击放大（对齐 RN DayMap.native）。
 */
@Composable
fun DayMap(
    tripId: String,
    dayId: String?,
    items: List<Item>,
    routeMode: String = "transit",
    height: Dp = 260.dp,
    title: String = "当日路线地图",
    onExpand: (String, List<MapMarkerNav>, List<List<List<Double>>>) -> Unit,
) {
    val located = items.filter { it.selected && it.location != null }
    if (located.isEmpty()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(height)
                .clip(RoundedCornerShape(22.dp))
                .background(ZhijingColors.Card)
                .padding(14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("暂无带坐标的景点", fontSize = 12.sp, color = ZhijingColors.Muted)
        }
        return
    }

    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xFFF3F4F6)),
    ) {
        HeroRouteMap(
            tripId = tripId,
            dayId = dayId,
            items = items,
            routeMode = routeMode,
            fill = true,
            showCategoryChips = false,
            onMarkerClick = {},
            onExpand = {
                val markers = routeItemMarkers(located)
                onExpand(
                    title,
                    markers.map { MapMarkerNav(it.lng, it.lat, it.name) },
                    polylinesFromItems(located),
                )
            },
        )
        Box(
            Modifier
                .matchParentSize()
                .clickable {
                    val markers = routeItemMarkers(located)
                    onExpand(
                        title,
                        markers.map { MapMarkerNav(it.lng, it.lat, it.name) },
                        polylinesFromItems(located),
                    )
                },
        )
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .padding(10.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.Black.copy(alpha = 0.55f))
                .padding(horizontal = 10.dp, vertical = 5.dp),
        ) {
            Text("点击放大地图", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}
