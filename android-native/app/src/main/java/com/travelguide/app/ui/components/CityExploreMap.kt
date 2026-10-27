package com.travelguide.app.ui.components

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.MapView
import com.amap.api.maps.model.BitmapDescriptorFactory
import com.amap.api.maps.model.Circle
import com.amap.api.maps.model.CircleOptions
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.LatLngBounds
import com.amap.api.maps.model.Marker
import com.amap.api.maps.model.MarkerOptions
import com.travelguide.app.data.util.CityPoiMarker
import com.travelguide.app.data.util.DeviceLocation
import kotlinx.coroutines.delay

/** 城市探索全屏地图：POI 标记 + 可选用户定位（对齐 RN CityDetail WebView 地图） */
@Composable
fun CityExploreMap(
    markers: List<CityPoiMarker>,
    userLocation: DeviceLocation?,
    sheetFraction: Float = 0.52f,
    focusSeq: Int = 0,
    onMarkerClick: (CityPoiMarker) -> Unit,
) {
    val mapView = rememberAmapMapView()
    var userMarker by remember { mutableStateOf<Marker?>(null) }
    var userCircle by remember { mutableStateOf<Circle?>(null) }
    val onClickState = rememberUpdatedState(onMarkerClick)

    fun drawPoiMarkers(aMap: AMap) {
        aMap.clear()
        userMarker = null
        userCircle = null
        val bounds = LatLngBounds.Builder()
        var hasBounds = false
        markers.forEach { m ->
            val ll = LatLng(m.lat, m.lng)
            bounds.include(ll)
            hasBounds = true
            val marker = aMap.addMarker(
                MarkerOptions()
                    .position(ll)
                    .title(m.item.name)
                    .snippet(m.icon),
            )
            marker?.`object` = m
        }
        userLocation?.let { loc ->
            val ll = LatLng(loc.lat, loc.lng)
            userMarker = aMap.addMarker(
                MarkerOptions()
                    .position(ll)
                    .anchor(0.5f, 0.5f)
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE)),
            )
            val radius = loc.accuracy.coerceIn(25f, 180f).toDouble()
            userCircle = aMap.addCircle(
                CircleOptions()
                    .center(ll)
                    .radius(radius)
                    .fillColor(0x331A66FF.toInt())
                    .strokeColor(0x991A66FF.toInt())
                    .strokeWidth(1f),
            )
        }
        when {
            hasBounds && markers.size > 1 -> runCatching {
                aMap.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), 120))
            }
            markers.size == 1 -> {
                val m = markers.first()
                aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(m.lat, m.lng), 14f))
            }
            userLocation != null -> {
                aMap.animateCamera(
                    CameraUpdateFactory.newLatLngZoom(LatLng(userLocation.lat, userLocation.lng), 14f),
                )
            }
        }
    }

    fun centerOnUser(aMap: AMap, view: MapView, loc: DeviceLocation) {
        val latLng = LatLng(loc.lat, loc.lng)
        view.post {
            val w = view.width
            val h = view.height
            if (w > 0 && h > 0) {
                val frac = sheetFraction.coerceIn(0.2f, 0.92f)
                val centerY = (h * (1f - frac) / 2f).toInt().coerceIn(h / 10, h / 2)
                aMap.setPointToCenter(w / 2, centerY)
            }
            aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(latLng, 15f))
        }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = {
            mapView.apply {
                map?.let { aMap ->
                    aMap.uiSettings.apply {
                        isZoomControlsEnabled = false
                        isMyLocationButtonEnabled = false
                        isCompassEnabled = false
                    }
                    aMap.setOnMarkerClickListener { marker ->
                        (marker.`object` as? CityPoiMarker)?.let { onClickState.value(it) }
                        true
                    }
                    drawPoiMarkers(aMap)
                }
            }
        },
        update = {
            it.map?.let { aMap -> drawPoiMarkers(aMap) }
        },
    )

    LaunchedEffect(userLocation?.lat, userLocation?.lng, userLocation?.accuracy, focusSeq, sheetFraction) {
        val loc = userLocation ?: return@LaunchedEffect
        repeat(8) {
            val aMap = mapView.map
            if (aMap != null) {
                centerOnUser(aMap, mapView, loc)
                return@LaunchedEffect
            }
            delay(80)
        }
    }
}
