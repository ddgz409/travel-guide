package com.travelguide.app.ui.screens.trip

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.lerp
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp as lerpColor
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/** 长按标题后的三段状态：充能 → 飞行 → 可编辑 */
enum class RenamePhase { None, Charging, Flying, Editing }

private val PillBlueStart = Color(0xFFDCF0FE)
private val PillBlueEnd = Color(0xFFF1FAFF)
private val PillBlueBorder = Color(0xFFB7E1F8)
private val InputGray = Color(0xFFEFF2F5)

/**
 * 顶部标题药丸：淡蓝渐变椭圆底突出标题文字。
 * 长按后文字变淡、中心出现双环并顺时针充注（由调用方驱动进度）。
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TripTitlePill(
    title: String,
    charging: Boolean,
    hidden: Boolean,
    chargeProgress: () -> Float,
    onBounds: (Rect) -> Unit,
    onLongPress: () -> Unit,
) {
    val titleAlpha by animateFloatAsState(
        targetValue = if (charging) 0.32f else 1f,
        animationSpec = tween(220),
        label = "titleDim",
    )
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .graphicsLayer { alpha = if (hidden) 0f else 1f }
            .onGloballyPositioned { onBounds(it.boundsInRoot()) }
            .clip(RoundedCornerShape(50))
            .background(Brush.linearGradient(listOf(PillBlueStart, PillBlueEnd)))
            .border(1.dp, PillBlueBorder, RoundedCornerShape(50))
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                onClick = {},
                onLongClick = onLongPress,
            )
            .padding(horizontal = 14.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = ZhijingColors.Ink.copy(alpha = titleAlpha),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (charging) {
            Box(Modifier.matchParentSize(), contentAlignment = Alignment.Center) {
                ChargeRing(chargeProgress)
            }
        }
    }
}

/** 双环充能指示：外环走进度，内环静态，从正上方顺时针一圈回到原点 */
@Composable
private fun ChargeRing(progress: () -> Float) {
    val p = progress().coerceIn(0f, 1f)
    Canvas(Modifier.fillMaxSize().padding(1.dp)) {
        val stroke = 2.2.dp.toPx()
        val radius = size.minDimension / 2f - stroke / 2f
        // 白底遮住文字，保证圆环清晰
        drawCircle(Color.White.copy(alpha = 0.94f), radius = radius + stroke / 2f)
        drawCircle(
            color = ZhijingColors.Brand.copy(alpha = 0.30f),
            radius = (radius - 4.dp.toPx()).coerceAtLeast(1f),
            style = Stroke(width = 1.2.dp.toPx()),
        )
        drawCircle(color = Color(0xFFCBE7F7), radius = radius, style = Stroke(width = stroke))
        if (p > 0f) {
            drawArc(
                color = ZhijingColors.BrandHot,
                startAngle = -90f,
                sweepAngle = 360f * p,
                useCenter = false,
                topLeft = Offset(center.x - radius, center.y - radius),
                size = Size(radius * 2f, radius * 2f),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
    }
}

/**
 * 改名界面：上一页淡出，标题药丸高亮滑入新位置并渐变为灰色输入框，
 * 主题蓝「确定」同步渐显。
 */
@Composable
fun TripRenameOverlay(
    titleRect: Rect?,
    draftTitle: String,
    saving: Boolean,
    exiting: Boolean,
    onDraftChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onCancelRequest: () -> Unit,
    onReady: () -> Unit,
    onLanded: () -> Unit,
    onClosed: () -> Unit,
) {
    val open = remember { Animatable(0f) }
    var overlayTopLeft by remember { mutableStateOf<Offset?>(null) }
    var inputRect by remember { mutableStateOf<Rect?>(null) }
    var landed by remember { mutableStateOf(false) }
    val exitAlpha by animateFloatAsState(
        targetValue = if (exiting) 0f else 1f,
        animationSpec = tween(180),
        label = "renameExit",
    )
    val backdropInteraction = remember { MutableInteractionSource() }

    LaunchedEffect(Unit) {
        while (inputRect == null || overlayTopLeft == null) withFrameNanos { }
        onReady()
        open.animateTo(1f, tween(560, easing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)))
        landed = true
        onLanded()
    }
    LaunchedEffect(exiting) {
        if (exiting) {
            delay(190)
            onClosed()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = exitAlpha }
            .onGloballyPositioned { overlayTopLeft = it.boundsInRoot().topLeft },
    ) {
        RenameScrim(open)
        Box(
            Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = backdropInteraction,
                    indication = null,
                    enabled = landed,
                    onClick = onCancelRequest,
                ),
        )
        Column(
            Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
        ) {
            RenameInputBox(
                value = draftTitle,
                landed = landed,
                onValueChange = onDraftChange,
                onConfirm = onConfirm,
                onMeasured = { inputRect = it },
            )
            Spacer(Modifier.height(16.dp))
            RenameConfirmButton(open, landed, saving, onConfirm)
        }
        TitleFlightClone(open, titleRect, overlayTopLeft, inputRect, draftTitle)
    }
}

/** 前一页整体渐变变淡 */
@Composable
private fun RenameScrim(open: Animatable<Float, AnimationVector1D>) {
    if (open.value <= 0f) return
    Box(
        Modifier
            .fillMaxSize()
            .background(ZhijingColors.Bg.copy(alpha = 0.965f * open.value)),
    )
}

/** 灰色标题输入框：飞行落地后才可见，保证与飞行中的药丸无缝衔接 */
@Composable
private fun RenameInputBox(
    value: String,
    landed: Boolean,
    onValueChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onMeasured: (Rect) -> Unit,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(56.dp)
            .graphicsLayer { alpha = if (landed) 1f else 0f }
            .onGloballyPositioned { onMeasured(it.boundsInRoot()) }
            .clip(RoundedCornerShape(16.dp))
            .background(InputGray),
        contentAlignment = Alignment.Center,
    ) {
        if (landed) {
            BasicTextField(
                value = value,
                onValueChange = { if (it.length <= 40) onValueChange(it) },
                singleLine = true,
                textStyle = TextStyle(
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.Ink,
                    textAlign = TextAlign.Center,
                ),
                cursorBrush = SolidColor(ZhijingColors.BrandHot),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onConfirm() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp),
                decorationBox = { inner ->
                    // BasicTextField 的输入框按内容宽度测量，需由外层 Box 居中，textAlign 才会生效
                    Box(
                        Modifier.fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (value.isEmpty()) {
                            Text(
                                "输入行程标题",
                                modifier = Modifier.fillMaxWidth(),
                                fontSize = 17.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = ZhijingColors.Muted,
                                textAlign = TextAlign.Center,
                            )
                        }
                        inner()
                    }
                },
            )
        } else {
            Text(
                value,
                modifier = Modifier.padding(horizontal = 18.dp),
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = ZhijingColors.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** 主题蓝「确定」，随飞行进度渐显 */
@Composable
private fun RenameConfirmButton(
    open: Animatable<Float, AnimationVector1D>,
    landed: Boolean,
    saving: Boolean,
    onConfirm: () -> Unit,
) {
    val raw = ((open.value - 0.42f) / 0.58f).coerceIn(0f, 1f)
    val alpha = raw * raw * (3f - 2f * raw)
    Box(
        Modifier
            .fillMaxWidth()
            .height(56.dp)
            .graphicsLayer { this.alpha = alpha }
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.BrandHot)
            .clickable(enabled = landed && alpha > 0.95f && !saving, onClick = onConfirm),
        contentAlignment = Alignment.Center,
    ) {
        Text("确定", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color.White)
    }
}

/** 飞行中的标题药丸：位置/尺寸/底色/圆角插值，落地即与灰色输入框重合 */
@Composable
private fun TitleFlightClone(
    open: Animatable<Float, AnimationVector1D>,
    titleRect: Rect?,
    overlayTopLeft: Offset?,
    targetRect: Rect?,
    title: String,
) {
    if (titleRect == null || overlayTopLeft == null || targetRect == null) return
    val t = open.value
    if (t >= 1f) return
    val start = titleRect.translate(-overlayTopLeft.x, -overlayTopLeft.y)
    val end = targetRect.translate(-overlayTopLeft.x, -overlayTopLeft.y)
    val rect = lerp(start, end, t)
    val textAlpha = (0.32f + 0.68f * (t / 0.18f).coerceIn(0f, 1f)).coerceAtMost(1f)
    val shapePercent = (50f + (28.6f - 50f) * t).roundToInt()
    val shape = RoundedCornerShape(percent = shapePercent)
    val background = Brush.linearGradient(
        listOf(
            lerpColor(PillBlueStart, InputGray, t),
            lerpColor(PillBlueEnd, InputGray, t),
        ),
    )
    val borderAlpha = (1f - t / 0.55f).coerceIn(0f, 1f)
    val density = LocalDensity.current
    Box(
        Modifier
            .offset { IntOffset(rect.left.roundToInt(), rect.top.roundToInt()) }
            .size(
                width = with(density) { rect.width.toDp() },
                height = with(density) { rect.height.toDp() },
            )
            .clip(shape)
            .background(background)
            .then(
                if (borderAlpha > 0f) {
                    Modifier.border(1.dp, PillBlueBorder.copy(alpha = borderAlpha), shape)
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title,
            modifier = Modifier.padding(horizontal = 14.dp),
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = ZhijingColors.Ink.copy(alpha = textAlpha),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
