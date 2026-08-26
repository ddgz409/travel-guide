package com.travelguide.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** 与 RN 版「知径」品牌色对齐：天蓝主色 + 清澈淡蓝背景 */
object ZhijingColors {
    val Bg = Color(0xFFFAFDFF)
    val BgSurface = Color(0xFFF3F9FD)
    val Ink = Color(0xFF1A1A1A)
    val Muted = Color(0xFF9E9E9E)
    val Brand = Color(0xFF4FC3F7)
    val BrandHot = Color(0xFF29B6F6)
    val BrandSoft = Color(0xFFE1F5FE)
    val Line = Color(0xFFF0F0F0)
    val Card = Color(0xFFFFFFFF)
    val Danger = Color(0xFFC62828)
    val Ready = Color(0xFF2E7D32)
    val Generating = Color(0xFFEF6C00)
}

/** 大卡片用：柔和马卡龙色（与 RN pastels 一致） */
val Pastels = listOf(
    Color(0xFFE8E4F8),
    Color(0xFFD7EAF8),
    Color(0xFFE4F0D8),
    Color(0xFFF8E8D8),
    Color(0xFFF5E0EC),
)

private val LightColors = lightColorScheme(
    primary = ZhijingColors.BrandHot,
    onPrimary = Color.White,
    primaryContainer = ZhijingColors.BrandSoft,
    onPrimaryContainer = ZhijingColors.Ink,
    secondary = ZhijingColors.Brand,
    background = ZhijingColors.Bg,
    onBackground = ZhijingColors.Ink,
    surface = ZhijingColors.Card,
    onSurface = ZhijingColors.Ink,
    surfaceVariant = ZhijingColors.BgSurface,
    onSurfaceVariant = ZhijingColors.Muted,
    outline = ZhijingColors.Line,
    error = ZhijingColors.Danger,
)

private val AppTypography = Typography(
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
)

/** 标准圆角（RN 版 borderRadius 24 的超椭圆视觉，Compose 用连续圆角近似） */
private val AppShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun ZhijingTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = AppTypography,
        shapes = AppShapes,
        content = content,
    )
}
