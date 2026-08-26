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
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.resolveImageUrl
import com.travelguide.app.data.model.Item

/** 拉取地点首图（可复用）：返回已走代理的可用 URL，无图返 null */
@Composable
fun rememberPlaceImage(
    city: String,
    name: String,
    kind: String = "",
    poiId: String = "",
): String? {
    var url by remember(city, name, kind, poiId) { mutableStateOf<String?>(null) }
    LaunchedEffect(city, name, kind, poiId) {
        if (city.isBlank() || name.isBlank()) return@LaunchedEffect
        url = runCatching {
            ApiClient.destinations.placeImages(city, name, kind, 1, poiId).images.firstOrNull()
        }.getOrNull()?.let { resolveImageUrl(it) }
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
    var imageUrl by remember(item.id, item.name, city) { mutableStateOf<String?>(null) }

    LaunchedEffect(item.id, item.name, city) {
        if (item.type == "transport" || city.isBlank()) return@LaunchedEffect
        val kind = when (item.type) {
            "meal" -> "foods"
            "attraction" -> "spots"
            else -> ""
        }
        val images = runCatching {
            ApiClient.destinations.placeImages(
                city = city,
                name = item.name,
                kind = kind,
                limit = 1,
                poiId = item.poiId.orEmpty(),
            ).images
        }.getOrDefault(emptyList())
        imageUrl = images.firstOrNull()?.let { resolveImageUrl(it) }
    }

    val url = imageUrl
    if (url != null) {
        AsyncImage(
            model = url,
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
