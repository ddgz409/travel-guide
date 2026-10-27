package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.local.MapPhotoStore
import com.travelguide.app.data.model.ProvinceMapData
import com.travelguide.app.data.util.CheckInMapHtmlOptions
import com.travelguide.app.data.util.buildCheckInMapHtml
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 省份打卡地图预览卡（WebView 中国省界图 + 相册填色，对齐 RN CheckInMapCard） */
@Composable
fun CheckInMapCard(
    checkedPrefectureIds: List<String>,
    loading: Boolean = false,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val context = LocalContext.current
    var provincePhotos by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var photosLoading by remember { mutableStateOf(true) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(reloadKey) {
        photosLoading = true
        provincePhotos = runCatching {
            withContext(Dispatchers.IO) { MapPhotoStore.buildProvincePhotoDataUris() }
        }.getOrDefault(emptyMap())
        photosLoading = false
    }

    DisposableEffect(Unit) {
        val unsub = MapPhotoStore.subscribe { reloadKey++ }
        onDispose { unsub() }
    }

    val regions = remember { ProvinceMapData.getProvinces(context) }
    val html = remember(checkedPrefectureIds, provincePhotos) {
        buildCheckInMapHtml(
            checkedPrefectureIds,
            regions,
            options = CheckInMapHtmlOptions(provincePhotos = provincePhotos),
        )
    }
    val busy = loading || photosLoading

    Column(
        modifier
            .fillMaxWidth()
            .shadow(8.dp, RoundedCornerShape(28.dp))
            .clip(RoundedCornerShape(28.dp))
            .background(Color.White),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1000f / 854f)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            if (!busy) {
                CheckInMapWebView(
                    html = html,
                    interactive = false,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                CircularProgressIndicator(color = Color(0xFF9B8EC4))
            }
            // WebView 会拦截触摸；透明层保证预览卡可点开全屏（对齐 RN pointerEvents=none）
            Box(
                Modifier
                    .fillMaxSize()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onClick,
                    ),
            )
        }
        Text(
            "点开地图 · 再点省份，从相册选一张照片填色",
            fontSize = 12.sp,
            color = Color(0xFF8A7AA8),
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.Normal,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}
