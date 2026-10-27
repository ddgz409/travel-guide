package com.travelguide.app.ui.components

import android.widget.Toast
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.LatLngBounds
import com.amap.api.maps.model.MarkerOptions
import com.amap.api.maps.model.MyLocationStyle
import com.amap.api.maps.model.PolylineOptions
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.ItemRouteUpdatePayload
import com.travelguide.app.data.local.LocationPrefs
import com.travelguide.app.data.model.RouteStep
import com.travelguide.app.data.model.TransportToNext
import com.travelguide.app.data.util.fetchDeviceLocation
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

private data class RouteMode(val id: String, val label: String)

private val MODE_TABS = listOf(
    RouteMode("transit", "公交地铁"),
    RouteMode("walking", "步行"),
    RouteMode("driving", "驾车"),
)

private fun modeLabel(mode: String): String = when (mode) {
    "walking" -> "步行"
    "driving" -> "驾车"
    else -> "公交地铁"
}

private fun modeBadge(mode: String): String = when (mode) {
    "walking" -> "步"
    "driving" -> "车"
    else -> "交"
}

private fun fmtKm(m: Double): String = if (m < 1000) "${m.roundToInt()}米" else "%.1f公里".format(m / 1000)

/** 到下一站的路线卡片 + 全屏路线规划弹层（对齐 RN TransportRouteSheet） */
@Composable
fun TransportRouteSheet(
    tripId: String,
    itemId: String,
    fromName: String,
    transport: TransportToNext,
    onUpdated: (TransportToNext) -> Unit = {},
) {
    var open by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf(transport.mode.ifBlank { "transit" }) }
    var data by remember { mutableStateOf(transport) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(transport) {
        data = transport
        mode = transport.mode.ifBlank { "transit" }
    }

    suspend fun loadRoute(m: String, forceReplan: Boolean) {
        loading = true
        error = null
        runCatching {
            if (forceReplan || m != data.mode) {
                ApiClient.trips.updateItemRoute(tripId, itemId, ItemRouteUpdatePayload(mode = m, schemeIndex = 0))
            } else {
                ApiClient.trips.getItemRoute(tripId, itemId, m)
            }
        }.fold(
            onSuccess = { next ->
                data = next
                mode = next.mode.ifBlank { m }
                onUpdated(next)
            },
            onFailure = { error = it.message ?: "路线加载失败" },
        )
        loading = false
    }

    LaunchedEffect(open) {
        if (open && (data.detail.isNullOrEmpty() || data.polyline.isNullOrEmpty())) {
            loadRoute(mode, false)
        }
    }

    val minutes = max(1, (data.durationS / 60.0).roundToInt())

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xFFF0F7FF))
            .clickable { open = true }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF1A66FF)),
                contentAlignment = Alignment.Center,
            ) {
                Text(modeBadge(data.mode), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
            }
            Text(
                "约 $minutes 分钟 · ${fmtKm(data.distanceM)} · ${modeLabel(data.mode)}",
                Modifier.weight(1f),
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1A66FF),
            )
            Text("查看线路 ›", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1A66FF))
        }
        Text(
            "从「$fromName」前往${data.toName?.let { "「$it」" } ?: "下一站"}",
            Modifier.padding(top = 4.dp),
            fontSize = 11.sp,
            color = ZhijingColors.Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }

    if (open) {
        Dialog(
            onDismissRequest = { open = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .background(Color.White),
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "‹ 返回",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZhijingColors.BrandHot,
                        modifier = Modifier.clickable { open = false },
                    )
                    Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                        Text("路线规划", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                        Text(
                            "$fromName -> ${data.toName ?: "下一站"}",
                            fontSize = 12.sp,
                            color = ZhijingColors.Muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        "关闭",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZhijingColors.Muted,
                        modifier = Modifier.clickable { open = false },
                    )
                }

                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    MODE_TABS.forEach { tab ->
                        val on = mode == tab.id
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(30.dp))
                                .background(if (on) Color(0xFF1A66FF) else ZhijingColors.Bg)
                                .clickable(enabled = !loading) {
                                    mode = tab.id
                                    scope.launch { loadRoute(tab.id, true) }
                                }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                tab.label,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (on) Color.White else ZhijingColors.Ink,
                            )
                        }
                    }
                }

                RouteMapBox(data = data, loading = loading)

                Column(
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    error?.let {
                        Text(it, color = ZhijingColors.Danger, fontSize = 13.sp)
                        Spacer(Modifier.height(8.dp))
                    }
                    if (loading && data.detail.isNullOrEmpty()) {
                        Text("加载路线中…", fontSize = 13.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(vertical = 20.dp))
                    }
                    data.detail.orEmpty().forEachIndexed { i, step ->
                        RouteStepRow(step)
                        if (i < data.detail.orEmpty().lastIndex) {
                            Spacer(Modifier.height(1.dp).fillMaxWidth().background(ZhijingColors.Line))
                        }
                    }
                    if (!loading && data.detail.isNullOrEmpty() && error == null) {
                        Text("暂无详细路段", fontSize = 13.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(vertical = 20.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun RouteMapBox(data: TransportToNext, loading: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val markers = remember(data, data.fromLocation, data.toLocation) {
        buildList {
            data.fromLocation?.let { add(MapMarkerArg(it.lng, it.lat, it.name ?: "起点")) }
            data.toLocation?.let { add(MapMarkerArg(it.lng, it.lat, it.name ?: "终点")) }
        }
    }
    val polyline = data.polyline.orEmpty()
    val mapView = rememberAmapMapView()

    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 12.dp)
            .height(220.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xFFEEF2F7)),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                mapView.apply { map?.let { drawRouteMap(it, markers, polyline) } }
            },
            update = { it.map?.let { aMap -> drawRouteMap(aMap, markers, polyline) } },
        )
        if (loading) {
            Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF1A66FF))
            }
        }
        if (LocationPrefs.isGrantedSync()) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp)
                    .size(36.dp)
                    .shadow(4.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White)
                    .clickable {
                        scope.launch {
                            val loc = runCatching { fetchDeviceLocation(context, highAccuracy = true) }.getOrNull()
                            if (loc == null) {
                                Toast.makeText(context, "定位失败，请稍后重试", Toast.LENGTH_SHORT).show()
                            } else {
                                mapView.map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(loc.lat, loc.lng), 15f))
                            }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text("◎", fontSize = 16.sp, color = Color(0xFF1A66FF))
            }
        }
    }
}

@Composable
private fun RouteStepRow(step: RouteStep) {
    val isWalk = step.type == "walk" || step.type == "drive"
    val title = when {
        step.type == "drive" -> "驾车"
        isWalk -> "步行"
        else -> step.lineName ?: "公交"
    }
    Column(Modifier.padding(vertical = 10.dp)) {
        Text(
            buildString {
                append(title)
                step.distanceM?.let { append(" · ${fmtKm(it)}") }
            },
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = ZhijingColors.Ink,
        )
        step.instruction?.takeIf { it.isNotBlank() }?.let {
            Text(it, Modifier.padding(top = 4.dp), fontSize = 12.sp, color = ZhijingColors.Muted, lineHeight = 18.sp)
        }
        listOfNotNull(step.departureStop, step.arrivalStop).takeIf { it.isNotEmpty() }?.let { stops ->
            Text(stops.joinToString(" -> "), Modifier.padding(top = 4.dp), fontSize = 12.sp, color = ZhijingColors.Muted)
        }
    }
}

private data class MapMarkerArg(val lng: Double, val lat: Double, val name: String)

private fun drawRouteMap(aMap: AMap, markers: List<MapMarkerArg>, polyline: List<List<Double>>) {
    aMap.clear()
    if (LocationPrefs.isGrantedSync()) {
        aMap.isMyLocationEnabled = true
        aMap.myLocationStyle = MyLocationStyle().apply {
            myLocationType(MyLocationStyle.LOCATION_TYPE_LOCATION_ROTATE_NO_CENTER)
            showMyLocation(true)
        }
    }
    val bounds = LatLngBounds.Builder()
    markers.forEach { m ->
        val ll = LatLng(m.lat, m.lng)
        bounds.include(ll)
        aMap.addMarker(MarkerOptions().position(ll).title(m.name))
    }
    if (polyline.size > 1) {
        val pts = polyline.mapNotNull { pt ->
            if (pt.size >= 2) LatLng(pt[1], pt[0]).also { bounds.include(it) } else null
        }
        if (pts.size > 1) {
            aMap.addPolyline(PolylineOptions().addAll(pts).width(8f).color(0xFF1A66FF.toInt()))
        }
    }
    if (markers.isNotEmpty() || polyline.size > 1) {
        runCatching { aMap.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), 80)) }
    }
}
