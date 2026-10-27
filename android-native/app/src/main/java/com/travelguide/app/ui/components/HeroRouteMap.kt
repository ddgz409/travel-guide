package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.viewinterop.AndroidView
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.LatLngBounds
import com.amap.api.maps.model.MarkerOptions
import com.amap.api.maps.model.PolylineOptions
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.util.MapCategoryFilter
import com.travelguide.app.data.util.RouteMapMarker
import com.travelguide.app.data.util.TripMapCategory
import com.travelguide.app.data.util.fetchCategoryMarkers
import com.travelguide.app.data.util.polylinesFromDayRoutes
import com.travelguide.app.data.util.polylinesFromItems
import com.travelguide.app.data.util.resolveTripItemId
import com.travelguide.app.data.util.routeItemMarkers
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 行程 Hero 地图（对齐 RN HeroRouteMap）：路线折线 + 分类筛选 + 展开全屏。
 */
@Composable
fun HeroRouteMap(
    tripId: String?,
    dayId: String?,
    items: List<Item>,
    categoryItems: List<Item> = items,
    destination: String = "",
    routeMode: String = "transit",
    pickMode: Boolean = false,
    onMapPick: ((lng: Double, lat: Double) -> Unit)? = null,
    modifier: Modifier = Modifier,
    height: Dp = 280.dp,
    fill: Boolean = false,
    showCategoryChips: Boolean = true,
    chipsTopPadding: Dp = 10.dp,
    /** 底部抽屉占用屏幕比例，用于 fit 相机时留出可见区域（TripDetail 约 0.52） */
    bottomSheetFraction: Float = 0f,
    polylineOverride: List<List<List<Double>>>? = null,
    onMarkerClick: (itemId: String?) -> Unit = {},
    onExpand: () -> Unit = {},
) {
    var category by remember { mutableStateOf<MapCategoryFilter>(null) }
    var routePolylines by remember { mutableStateOf<List<List<List<Double>>>>(emptyList()) }
    var categoryMarkers by remember { mutableStateOf<List<RouteMapMarker>>(emptyList()) }
    var categoryLoading by remember { mutableStateOf(false) }
    var routeLoading by remember { mutableStateOf(false) }

    val routeMarkers = remember(items) { routeItemMarkers(items) }
    val categoryActive = category != null
    val onMarkerClickState = rememberUpdatedState(onMarkerClick)
    val onMapPickState = rememberUpdatedState(onMapPick)
    val pickModeState = rememberUpdatedState(pickMode)
    val categoryItemsState = rememberUpdatedState(categoryItems)

    LaunchedEffect(category, destination, categoryItems) {
        if (category == null) {
            categoryMarkers = emptyList()
            return@LaunchedEffect
        }
        categoryLoading = true
        val cat = category!!
        categoryMarkers = withContext(Dispatchers.IO) {
            runCatching { fetchCategoryMarkers(cat, destination, categoryItems) }
                .getOrDefault(emptyList())
        }
        categoryLoading = false
    }

    LaunchedEffect(tripId, dayId, items, category, routeMode, polylineOverride) {
        if (category != null) {
            routePolylines = emptyList()
            return@LaunchedEffect
        }
        if (polylineOverride != null) {
            routePolylines = polylineOverride
            return@LaunchedEffect
        }
        val source = items.filter { it.selected && it.location != null }
        // 先用条目缓存折线；再拉远程规划（对齐 RN HeroRouteMap）
        routePolylines = polylinesFromItems(source)
        if (tripId.isNullOrBlank() || dayId.isNullOrBlank() || source.size < 2) return@LaunchedEffect
        routeLoading = true
        try {
            val remote = withContext(Dispatchers.IO) {
                runCatching { ApiClient.trips.getDayRoutes(tripId, dayId, mode = routeMode) }.getOrNull()
            }
            if (remote != null) {
                val groups = polylinesFromDayRoutes(remote.segments)
                if (groups.isNotEmpty()) {
                    routePolylines = groups
                }
            }
        } finally {
            routeLoading = false
        }
    }

    val displayRouteMarkers = if (categoryActive) emptyList() else routeMarkers
    val displayCategoryMarkers = if (categoryActive) categoryMarkers else emptyList()

    BoxWithConstraints(
        modifier.then(if (fill) Modifier.fillMaxSize() else Modifier.fillMaxWidth().height(height)),
    ) {
        val density = LocalDensity.current
        val mapWidthPx = with(density) { maxWidth.toPx().toInt().coerceAtLeast(1) }
        val mapHeightPx = with(density) { maxHeight.toPx().toInt().coerceAtLeast(1) }
        val fitPadding = remember(mapWidthPx, mapHeightPx, bottomSheetFraction) {
            MapFitPadding(
                mapWidthPx = mapWidthPx,
                mapHeightPx = mapHeightPx,
                edgePaddingPx = with(density) { 56.dp.toPx().toInt() },
                bottomSheetFraction = bottomSheetFraction.coerceIn(0f, 0.85f),
            )
        }

        Box(Modifier.fillMaxSize()) {
            val mapView = rememberAmapMapView()
            AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                mapView.apply {
                    map?.let { aMap ->
                        aMap.uiSettings.apply {
                            isZoomControlsEnabled = false
                            isMyLocationButtonEnabled = false
                        }
                        aMap.setOnMarkerClickListener { marker ->
                            if (pickModeState.value) return@setOnMarkerClickListener false
                            val payload = marker.`object` as? RouteMapMarker ?: return@setOnMarkerClickListener false
                            val id = resolveTripItemId(
                                categoryItemsState.value,
                                payload.name,
                                payload.lng,
                                payload.lat,
                                payload.itemId,
                            )
                            onMarkerClickState.value(id)
                            true
                        }
                        aMap.setOnMapClickListener { latLng ->
                            if (pickModeState.value) {
                                onMapPickState.value?.invoke(latLng.longitude, latLng.latitude)
                            }
                        }
                        drawHeroRouteMap(
                            aMap,
                            displayRouteMarkers,
                            displayCategoryMarkers,
                            routePolylines,
                            fitPadding,
                        )
                    }
                }
            },
            update = {
                it.map?.let { aMap ->
                    aMap.setOnMapClickListener { latLng ->
                        if (pickModeState.value) {
                            onMapPickState.value?.invoke(latLng.longitude, latLng.latitude)
                        }
                    }
                    drawHeroRouteMap(
                        aMap,
                        displayRouteMarkers,
                        displayCategoryMarkers,
                        routePolylines,
                        fitPadding,
                    )
                }
            },
        )

        if (showCategoryChips && !pickMode) {
            Row(
                Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .padding(top = chipsTopPadding, start = 12.dp, end = 12.dp, bottom = 10.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CategoryChip(
                    label = "全部",
                    active = category == null,
                    onClick = { category = null },
                )
                TripMapCategory.entries.forEach { cat ->
                    CategoryChip(
                        label = "${cat.icon} ${cat.label}",
                        active = category == cat,
                        onClick = { category = if (category == cat) null else cat },
                    )
                }
            }
        }

        if (categoryLoading || routeLoading) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.92f)),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ZhijingColors.Brand)
            }
        }

        if (!pickMode) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(12.dp)
                    .shadow(4.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White)
                    .clickable(onClick = onExpand)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text("⛶ 展开", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            }
        }
        }
    }
}

@Composable
private fun CategoryChip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(if (active) ZhijingColors.Brand else Color.White.copy(alpha = 0.94f))
            .border(1.dp, if (active) ZhijingColors.Brand else ZhijingColors.Line, RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (active) Color.White else ZhijingColors.Ink,
        )
    }
}

private data class MapFitPadding(
    val mapWidthPx: Int,
    val mapHeightPx: Int,
    val edgePaddingPx: Int,
    val bottomSheetFraction: Float,
)

private const val MAX_FIT_ZOOM = 13f
private const val SINGLE_MARKER_ZOOM = 12f

/**
 * 南侧重扩 bounds，使 fit 后景点整体上移，避开底部抽屉遮挡。
 */
private fun expandBoundsForBottomSheet(bounds: LatLngBounds, bottomFraction: Float): LatLngBounds {
    val latSpan = (bounds.northeast.latitude - bounds.southwest.latitude).coerceAtLeast(0.008)
    val lngSpan = (bounds.northeast.longitude - bounds.southwest.longitude).coerceAtLeast(0.008)
    val side = 0.14
    val southExtra = latSpan * (0.12 + bottomFraction * 0.95)
    return LatLngBounds(
        LatLng(
            bounds.southwest.latitude - southExtra,
            bounds.southwest.longitude - lngSpan * side,
        ),
        LatLng(
            bounds.northeast.latitude + latSpan * side,
            bounds.northeast.longitude + lngSpan * side,
        ),
    )
}

private fun drawHeroRouteMap(
    aMap: AMap,
    routeMarkers: List<RouteMapMarker>,
    categoryMarkers: List<RouteMapMarker>,
    polylines: List<List<List<Double>>>,
    fitPadding: MapFitPadding,
) {
    aMap.clear()
    val bounds = LatLngBounds.Builder()
    var hasBounds = false

    fun addMarker(m: RouteMapMarker) {
        val ll = LatLng(m.lat, m.lng)
        bounds.include(ll)
        hasBounds = true
        val opts = MarkerOptions().position(ll).title(m.name)
        if (!m.icon.isNullOrBlank() && m.isRoute) {
            opts.snippet(m.icon)
        }
        val marker = aMap.addMarker(opts)
        marker?.`object` = m
    }

    routeMarkers.forEach(::addMarker)
    categoryMarkers.forEach(::addMarker)

    polylines.forEach { group ->
        val pts = group.mapNotNull { pt ->
            if (pt.size >= 2) LatLng(pt[1], pt[0]).also { bounds.include(it); hasBounds = true } else null
        }
        if (pts.size > 1) {
            aMap.addPolyline(
                PolylineOptions()
                    .addAll(pts)
                    .width(10f)
                    .color(0xFF1A66FF.toInt()),
            )
        }
    }

    when {
        !hasBounds -> Unit
        routeMarkers.size == 1 && categoryMarkers.isEmpty() -> {
            val m = routeMarkers.first()
            val latOffset = 0.025 * fitPadding.bottomSheetFraction
            aMap.moveCamera(
                CameraUpdateFactory.newLatLngZoom(LatLng(m.lat - latOffset, m.lng), SINGLE_MARKER_ZOOM),
            )
        }
        else -> runCatching {
            val expanded = expandBoundsForBottomSheet(bounds.build(), fitPadding.bottomSheetFraction)
            val pad = fitPadding.edgePaddingPx +
                (fitPadding.mapHeightPx * fitPadding.bottomSheetFraction * 0.15f).toInt()
            aMap.animateCamera(
                CameraUpdateFactory.newLatLngBounds(
                    expanded,
                    fitPadding.mapWidthPx,
                    fitPadding.mapHeightPx,
                    pad,
                ),
                object : AMap.CancelableCallback {
                    override fun onFinish() {
                        val z = aMap.cameraPosition?.zoom ?: return
                        if (z > MAX_FIT_ZOOM) {
                            aMap.animateCamera(CameraUpdateFactory.zoomTo(MAX_FIT_ZOOM))
                        }
                    }

                    override fun onCancel() {}
                },
            )
        }
    }
}
