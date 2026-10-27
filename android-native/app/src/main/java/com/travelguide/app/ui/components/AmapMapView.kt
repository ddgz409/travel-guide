package com.travelguide.app.ui.components

import android.os.Bundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.amap.api.maps.MapView
import com.travelguide.app.data.util.AmapKeyManager

/**
 * 创建带 Key 自动切换的高德 MapView（generation 变化时重建，触发备用 Key）。
 */
@Composable
fun rememberAmapMapView(): MapView {
    val context = LocalContext.current
    val generation by AmapKeyManager.generation.collectAsState()
    val mapView = remember(generation) {
        AmapKeyManager.applyActiveKey()
        MapView(context).apply { onCreate(Bundle()) }
    }
    DisposableEffect(mapView) {
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onDestroy()
        }
    }
    return mapView
}
