package com.travelguide.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.ui.theme.ZhijingColors

/** 对齐 RN DraggableBottomSheet：三档吸附 + 顶部拖拽把手 + 底部 footer 区 */
@Composable
fun DraggableBottomSheet(
    modifier: Modifier = Modifier,
    snapFractions: FloatArray = floatArrayOf(0.38f, 0.52f, 0.78f),
    initialFraction: Float = 0.52f,
    onFractionChange: (Float) -> Unit = {},
    footer: @Composable () -> Unit = {},
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier.fillMaxSize()) {
        val fullH = maxHeight
        val density = LocalDensity.current
        val fullHPx = with(density) { fullH.toPx() }
        var frac by remember {
            mutableFloatStateOf(initialFraction.coerceIn(snapFractions.first(), snapFractions.last()))
        }
        val animatedFrac by animateFloatAsState(
            targetValue = frac,
            animationSpec = spring(dampingRatio = 0.82f, stiffness = 320f),
            label = "sheetFrac",
        )
        SideEffect { onFractionChange(animatedFrac) }

        fun snap() {
            frac = snapFractions.minByOrNull { kotlin.math.abs(it - frac) } ?: initialFraction
        }

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(fullH * animatedFrac)
                .shadow(12.dp, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .background(ZhijingColors.Card)
                .navigationBarsPadding(),
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .pointerInput(fullHPx, snapFractions) {
                        detectVerticalDragGestures(
                            onDragEnd = { snap() },
                            onDragCancel = { snap() },
                            onVerticalDrag = { change, drag ->
                                change.consume()
                                frac = (frac - drag / fullHPx).coerceIn(snapFractions.first(), snapFractions.last())
                            },
                        )
                    },
            ) {
                Box(
                    Modifier
                        .padding(top = 10.dp, bottom = 6.dp)
                        .size(width = 38.dp, height = 4.dp)
                        .align(Alignment.CenterHorizontally)
                        .clip(RoundedCornerShape(2.dp))
                        .background(ZhijingColors.Line),
                )
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                content()
            }
            footer()
        }
    }
}

/** RN favoritesStyles.addBtn：黑色胶囊 CTA */
@Composable
fun FavoritesAddButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 8.dp)
            .shadow(6.dp, RoundedCornerShape(27.dp))
            .clip(RoundedCornerShape(27.dp))
            .background(Color(0xFF111111))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .height(54.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("+", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(Modifier.width(8.dp))
            Text(label, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
        }
    }
}
