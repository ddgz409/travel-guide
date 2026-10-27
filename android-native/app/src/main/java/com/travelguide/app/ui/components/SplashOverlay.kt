package com.travelguide.app.ui.components

import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.travelguide.app.R
import kotlinx.coroutines.delay

/** 与 RN splash-screen2 天空色一致 */
val SplashBg = Color(0xFF4D90BB)

private const val HOLD_MS = 2400L
private const val FADE_IN_MS = 700
private const val FADE_OUT_MS = 480

/** 启动页遮罩（对齐 RN SplashOverlay：淡入 → 停留 → 淡出） */
@Composable
fun SplashOverlay(
    ready: Boolean,
    onFinished: () -> Unit,
) {
    var held by remember { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }
    var appReady by remember { mutableStateOf(ready) }

    val artAlpha by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(FADE_IN_MS, easing = EaseOutCubic),
        label = "splashArt",
    )
    val veilAlpha by animateFloatAsState(
        targetValue = if (leaving) 0f else 1f,
        animationSpec = tween(FADE_OUT_MS),
        label = "splashVeil",
        finishedListener = {
            if (leaving) onFinished()
        },
    )

    LaunchedEffect(ready) {
        appReady = ready
        if (held && ready && !leaving) leaving = true
    }

    LaunchedEffect(Unit) {
        delay(HOLD_MS)
        held = true
        if (appReady && !leaving) leaving = true
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(SplashBg)
            .alpha(veilAlpha),
    ) {
        Box(Modifier.fillMaxSize().alpha(artAlpha)) {
            Image(
                painter = painterResource(R.drawable.splash_screen2),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }
    }
}
