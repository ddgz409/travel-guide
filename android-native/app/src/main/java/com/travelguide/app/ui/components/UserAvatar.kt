package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.ui.theme.ZhijingColors

/** 头像形态（对齐 RN UserAvatar variant）：circle = 列表小头像；card = 主页大头像 */
enum class AvatarVariant { CIRCLE, CARD }

/** 头像：有自定义图则显示图片，否则昵称首字（对齐 RN UserAvatar） */
@Composable
fun UserAvatar(
    name: String,
    size: Dp = 40.dp,
    variant: AvatarVariant = AvatarVariant.CIRCLE,
    imageUri: String? = null,
) {
    val radius = if (variant == AvatarVariant.CIRCLE) {
        size / 2
    } else {
        maxOf(12.dp, size * 0.32f)
    }
    val shape = RoundedCornerShape(radius)
    val shell = Modifier
        .size(size)
        .shadow(2.dp, shape)
        .clip(shape)
        .background(Color.White)
        .let {
            if (variant == AvatarVariant.CIRCLE) {
                it.border(1.dp, Color.Black.copy(alpha = 0.04f), shape)
            } else {
                it
            }
        }

    if (!imageUri.isNullOrBlank()) {
        AsyncImage(
            model = imageUri,
            contentDescription = "${name}的头像",
            modifier = shell,
            contentScale = ContentScale.Crop,
        )
        return
    }

    val initial = name.trim().firstOrNull()?.toString() ?: "游"
    Box(shell, contentAlignment = Alignment.Center) {
        Text(
            initial,
            fontSize = (size.value * 0.42f).sp,
            fontWeight = FontWeight.ExtraBold,
            color = ZhijingColors.BrandHot,
        )
    }
}
