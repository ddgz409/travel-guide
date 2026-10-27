package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.travelguide.app.data.local.PlaceImageCache
import com.travelguide.app.data.model.Item

/**
 * 拉取地点首图（内存+磁盘缓存，对齐 RN PlaceImage）。
 * 有缓存时首帧即可出图，不再每次打 place-images。
 */
@Composable
fun rememberPlaceImage(
    city: String,
    name: String,
    kind: String = "",
    poiId: String = "",
): String? {
    var url by remember(city, name, kind, poiId) {
        mutableStateOf(PlaceImageCache.peek(city, name, kind, poiId)?.firstOrNull())
    }
    LaunchedEffect(city, name, kind, poiId) {
        if (city.isBlank() || name.isBlank()) return@LaunchedEffect
        // 已有内存命中则跳过；否则走磁盘→网络
        if (url != null) return@LaunchedEffect
        url = PlaceImageCache.getUrls(city, name, kind, poiId, 1).firstOrNull()
    }
    return url
}

/**
 * 地点封面：优先展示高德真实图片，无图时兜底 emoji + 底色（对齐 RN PlaceImage）。
 */
@Composable
fun PlaceCover(
    item: Item,
    city: String,
    modifier: Modifier = Modifier,
    emoji: String,
    emojiBg: Color,
) {
    val kind = when (item.type) {
        "meal" -> "foods"
        "attraction" -> "spots"
        else -> ""
    }
    val poiId = item.poiId.orEmpty()
    var imageUrl by remember(item.id, item.name, city, kind, poiId) {
        mutableStateOf(
            if (item.type == "transport" || city.isBlank()) null
            else PlaceImageCache.peek(city, item.name, kind, poiId)?.firstOrNull(),
        )
    }
    val context = LocalContext.current

    LaunchedEffect(item.id, item.name, city, kind, poiId) {
        if (item.type == "transport" || city.isBlank()) return@LaunchedEffect
        imageUrl = PlaceImageCache.getUrls(city, item.name, kind, poiId, 1).firstOrNull()
    }

    val url = imageUrl
    if (url != null) {
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data(url)
                .crossfade(false)
                .build(),
            contentDescription = item.name,
            modifier = modifier,
            contentScale = ContentScale.Crop,
        )
    } else {
        Box(modifier.background(emojiBg), contentAlignment = Alignment.Center) {
            Text(emoji, fontSize = 24.sp)
        }
    }
}
