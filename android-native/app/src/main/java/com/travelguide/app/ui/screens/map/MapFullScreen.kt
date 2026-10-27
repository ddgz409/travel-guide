package com.travelguide.app.ui.screens.map

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.travelguide.app.data.local.LocationPrefs
import com.travelguide.app.data.util.fetchDeviceLocation
import com.travelguide.app.ui.components.rememberAmapMapView
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.LatLngBounds
import com.amap.api.maps.model.MarkerOptions
import com.amap.api.maps.model.MyLocationStyle
import com.amap.api.maps.model.PolylineOptions
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

data class MapMarkerArg(val lng: Double, val lat: Double, val name: String)

/** 全屏地图（对齐 RN MapFullScreen，使用高德原生 SDK） */
@Composable
fun MapFullScreen(
    title: String?,
    markers: List<MapMarkerArg>,
    polylines: List<List<List<Double>>> = emptyList(),
    polyline: List<List<Double>> = emptyList(),
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val groups = remember(polylines, polyline) {
        if (polylines.isNotEmpty()) polylines.filter { it.size > 1 }
        else if (polyline.size > 1) listOf(polyline) else emptyList()
    }

    val mapView = rememberAmapMapView()

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader(title ?: "地图", onBack)
        Box(Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = {
                    mapView.apply {
                        map?.let { aMap -> drawMap(aMap, markers, groups) }
                    }
                },
                update = { it.map?.let { aMap -> drawMap(aMap, markers, groups) } },
            )

            if (LocationPrefs.isGrantedSync()) {
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(16.dp)
                        .size(46.dp)
                        .shadow(6.dp, CircleShape)
                        .clip(CircleShape)
                        .background(Color.White)
                        .clickable {
                            scope.launch {
                                val loc = runCatching {
                                    fetchDeviceLocation(context, highAccuracy = true)
                                }.getOrNull()
                                if (loc == null) {
                                    Toast.makeText(context, "定位失败，请稍后重试", Toast.LENGTH_SHORT).show()
                                    return@launch
                                }
                                mapView.map?.animateCamera(
                                    CameraUpdateFactory.newLatLngZoom(LatLng(loc.lat, loc.lng), 15f),
                                )
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("◎", fontSize = 20.sp, color = ZhijingColors.BrandHot)
                }
            }
        }
    }
}

private fun drawMap(aMap: AMap, markers: List<MapMarkerArg>, groups: List<List<List<Double>>>) {
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
    groups.forEach { group ->
        val pts = group.mapNotNull { pt ->
            if (pt.size >= 2) LatLng(pt[1], pt[0]).also { bounds.include(it) } else null
        }
        if (pts.size > 1) {
            aMap.addPolyline(PolylineOptions().addAll(pts).width(8f).color(0xFF1A66FF.toInt()))
        }
    }
    if (markers.isNotEmpty() || groups.isNotEmpty()) {
        runCatching { aMap.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), 80)) }
    }
}
