package com.travelguide.app.ui.components

import android.os.Bundle
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.MapView
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.LatLngBounds
import com.amap.api.maps.model.MarkerOptions
import com.travelguide.app.data.model.Item

/**
 * 阶段 0 PoC：高德 3D 地图头（原生 SDK 验证）。
 *
 * - MapView 用 AndroidView 挂进 Compose，生命周期用 DisposableEffect 简化托管；
 * - 展示当天有坐标的 POI 标记（按顺序编号），并自动框选视野；
 * - key 校验失败时 SDK 渲染灰底——真机看一眼即可判定 key 是否生效。
 */
@Composable
fun MapHeader(items: List<Item>, modifier: Modifier = Modifier, height: Dp = 200.dp) {
    val context = LocalContext.current
    val pois = remember(items) { items.filter { it.location != null } }

    val mapView = remember {
        MapView(context).apply { onCreate(Bundle()) }
    }
    DisposableEffect(Unit) {
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onDestroy()
        }
    }

    AndroidView(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(16.dp)),
        factory = {
            mapView.apply {
                // 高德 SDK 无 getMapAsync：onCreate 后 getMap() 直接可用
                val aMap = map
                if (aMap != null) {
                    aMap.uiSettings.apply {
                        isZoomControlsEnabled = false
                        isMyLocationButtonEnabled = false
                    }
                    drawPois(aMap, pois)
                }
            }
        },
        update = {
            // 点位变化（如生成中逐步落地）时重绘标记并调整视野
            it.map?.let { aMap -> drawPois(aMap, pois) }
        },
    )
}

private fun drawPois(aMap: AMap, pois: List<Item>) {
    aMap.clear()
    if (pois.isEmpty()) return

    val boundsBuilder = LatLngBounds.Builder()
    pois.forEachIndexed { index, item ->
        val loc = item.location ?: return@forEachIndexed
        val latLng = LatLng(loc.lat, loc.lng)
        boundsBuilder.include(latLng)
        aMap.addMarker(
            MarkerOptions()
                .position(latLng)
                .title("${index + 1}. ${item.name}"),
        )
    }

    if (pois.size == 1) {
        pois.first().location?.let {
            aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(it.lat, it.lng), 14f))
        }
    } else {
        try {
            aMap.moveCamera(CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), 96))
        } catch (_: Exception) {
            // 地图尚未布局完成时 newLatLngBounds 会抛错，PoC 阶段先忽略
        }
    }
}
