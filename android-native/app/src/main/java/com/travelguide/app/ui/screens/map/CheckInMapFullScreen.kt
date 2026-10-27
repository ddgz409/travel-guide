package com.travelguide.app.ui.screens.map

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.statusBarsPadding
import com.travelguide.app.data.local.CheckInStore
import com.travelguide.app.data.local.MapPhotoStore
import com.travelguide.app.data.model.ProvinceMapData
import com.travelguide.app.data.util.CheckInMapHtmlOptions
import com.travelguide.app.data.util.buildCheckInMapHtml
import com.travelguide.app.ui.components.CheckInMapWebView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 全屏打卡地图（WebView 中国省界图，点省份选相册照片填色，对齐 RN CheckInMapFullScreen） */
@Composable
fun CheckInMapFullScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var initialLoading by remember { mutableStateOf(true) }
    var checkedIds by remember { mutableStateOf(emptyList<String>()) }
    var provincePhotos by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var reloadKey by remember { mutableStateOf(0) }
    var pendingProvince by remember { mutableStateOf<Pair<String, String>?>(null) }
    var pickForKey by remember { mutableStateOf<String?>(null) }

    val pickLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        val key = pickForKey
        pickForKey = null
        if (uri != null && key != null) {
            scope.launch {
                MapPhotoStore.setProvincePhoto(key, uri)
                reloadKey++
            }
        }
    }

    LaunchedEffect(reloadKey) {
        if (reloadKey == 0) initialLoading = true
        withContext(Dispatchers.IO) {
            checkedIds = CheckInStore.checkedPrefectureIds()
            provincePhotos = MapPhotoStore.buildProvincePhotoDataUris()
        }
        initialLoading = false
    }

    DisposableEffect(Unit) {
        val unsub = MapPhotoStore.subscribe { reloadKey++ }
        onDispose { unsub() }
    }

    val regions = remember { ProvinceMapData.getProvinces(context) }
    val html = remember(checkedIds, provincePhotos) {
        buildCheckInMapHtml(
            checkedIds,
            regions,
            options = CheckInMapHtmlOptions(interactive = true, provincePhotos = provincePhotos),
        )
    }

    Box(Modifier.fillMaxSize().background(Color.White)) {
        if (initialLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF9B8EC4))
            }
        } else {
            CheckInMapWebView(
                html = html,
                interactive = true,
                modifier = Modifier.fillMaxSize(),
                onProvinceClick = { key, label -> pendingProvince = key to label },
            )
        }

        Box(
            Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(start = 12.dp, top = 4.dp)
                .size(40.dp)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(Color(0xE0FFFFFF))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Text("‹", fontSize = 28.sp, color = Color(0xFF7A6A9E))
        }

        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 28.dp)
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp))
                .background(Color(0xEBC4B3E4))
                .padding(horizontal = 14.dp, vertical = 7.dp),
        ) {
            Text(
                "点省份 · 从相册选一张照片",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
            )
        }
    }

    pendingProvince?.let { (key, label) ->
        val hasPhoto = provincePhotos.containsKey(key)
        AlertDialog(
            onDismissRequest = { pendingProvince = null },
            title = { Text(label.ifBlank { ProvinceMapData.provinceLabel(key) }) },
            text = {
                Column {
                    Text(if (hasPhoto) "更换照片，或清空恢复紫色" else "选一张照片填满这个省")
                    if (hasPhoto) {
                        TextButton(onClick = {
                            pendingProvince = null
                            scope.launch {
                                MapPhotoStore.clearProvincePhoto(key)
                                reloadKey++
                            }
                        }) {
                            Text("清空照片", color = Color(0xFFE53935))
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingProvince = null
                    pickForKey = key
                    pickLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text(if (hasPhoto) "更换照片" else "选择照片") }
            },
            dismissButton = {
                TextButton(onClick = { pendingProvince = null }) { Text("取消") }
            },
        )
    }
}
