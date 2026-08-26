package com.travelguide.app.ui.screens.main

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.travelguide.app.R
import com.travelguide.app.ui.screens.TripsScreen
import com.travelguide.app.ui.screens.explore.ExploreScreen
import com.travelguide.app.ui.screens.me.MeScreen
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

enum class MainTab { TRIPS, EXPLORE, ME }

private val TAB_LABELS = mapOf(
    MainTab.TRIPS to "计划",
    MainTab.EXPLORE to "探索",
    MainTab.ME to "我的",
)

/** 底栏内容高度（胶囊 52 + 上下内边距），屏幕内容据此避让 */
val TAB_BAR_RESERVE = 86.dp

/**
 * 底部 Tab 主框架（计划 / 探索 / 我的），对齐 RN MainScreen：
 * - 默认落在探索页；探索页常驻保活，切其它 Tab 只叠加覆盖层；
 * - 白色胶囊 + 浅蓝气泡滑动指示 + 右侧加号气泡菜单。
 */
@Composable
fun MainScreen(
    onOpenTrip: (String) -> Unit,
    onOpenGenerate: (String?) -> Unit,
    onOpenShare: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenChat: () -> Unit,
    onOpenCityGuide: (String) -> Unit,
    onOpenSharedCollections: () -> Unit,
    onOpenCollectionDetail: (String) -> Unit,
    onOpenUserProfile: (String, String) -> Unit,
    onOpenTravelSearch: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenSubscriptions: () -> Unit,
    onOpenFootprints: () -> Unit,
) {
    var tab by remember { mutableStateOf(MainTab.EXPLORE) }
    var plusOpen by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        // 探索页始终组合（保活），其余 Tab 覆盖其上
        ExploreScreen(
            active = tab == MainTab.EXPLORE,
            onOpenMe = { tab = MainTab.ME },
            onOpenSettings = onOpenSettings,
            onOpenChat = onOpenChat,
            onOpenGenerate = onOpenGenerate,
            onOpenCityGuide = onOpenCityGuide,
            onOpenSharedCollections = onOpenSharedCollections,
            onOpenCollectionDetail = onOpenCollectionDetail,
            onOpenUserProfile = onOpenUserProfile,
            onOpenTravelSearch = onOpenTravelSearch,
        )
        if (tab == MainTab.TRIPS) {
            Box(Modifier.fillMaxSize().background(ZhijingColors.Bg).padding(bottom = TAB_BAR_RESERVE)) {
                TripsScreen(
                    onOpenTrip = onOpenTrip,
                    onOpenGenerate = { onOpenGenerate(null) },
                    onOpenShare = onOpenShare,
                )
            }
        }
        if (tab == MainTab.ME) {
            Box(Modifier.fillMaxSize().background(ZhijingColors.Bg).padding(bottom = TAB_BAR_RESERVE)) {
                MeScreen(
                    onOpenSettings = onOpenSettings,
                    onOpenFavorites = onOpenFavorites,
                    onOpenSubscriptions = onOpenSubscriptions,
                    onOpenFootprints = onOpenFootprints,
                )
            }
        }
        ZhijingTabBar(
            active = tab,
            onChange = { tab = it },
            onPlus = { plusOpen = true },
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }

    if (plusOpen) {
        PlusMenuOverlay(
            onDismiss = { plusOpen = false },
            onPick = { plusOpen = false; onOpenGenerate(null) },
        )
    }
}

/* ---------- 加号气泡菜单（对齐 RN PlusMenu） ---------- */

private const val BUBBLE_D_DP = 132f // 球体直径
private const val BUBBLE_R_DP = 170f // 球心到 + 圆心距离
private const val START_PHI = 180.0 // 起点：正下方（顺时针自下而上滑出）
private const val QUICK_PHI = 285.0 // 快速模式：偏左略上
private const val AI_PHI = 340.0 // AI 智能生成：偏上略左

// RN 弹簧参数换算：dampingRatio = damping / (2√(stiffness·mass))
private val BUBBLE_IN = spring<Float>(0.33f, 260f) // damping9 stiffness260 mass0.7，果冻回弹
private val BUBBLE_OUT = spring<Float>(0.59f, 320f)
private val ROT_SPRING = spring<Float>(0.58f, 240f)

/**
 * + 号弹出菜单：两颗肥皂泡以 + 为圆心顺时针自下而上滑出，
 * 快速球先出场、AI 球晚 120ms；+ 旋转 45° 成 ×，轻蒙层点按关闭。
 */
@Composable
private fun PlusMenuOverlay(onDismiss: () -> Unit, onPick: () -> Unit) {
    val scope = rememberCoroutineScope()
    val pQuick = remember { Animatable(0f) }
    val pAI = remember { Animatable(0f) }
    val rot = remember { Animatable(0f) }
    val scrim = remember { Animatable(0f) }
    var closing by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        launch { scrim.animateTo(1f, tween(160)) }
        launch { rot.animateTo(45f, ROT_SPRING) }
        launch { pQuick.animateTo(1f, BUBBLE_IN) }
        launch {
            delay(120)
            pAI.animateTo(1f, BUBBLE_IN)
        }
    }

    fun close() {
        if (closing) return
        closing = true
        scope.launch {
            launch { pQuick.animateTo(0f, BUBBLE_OUT) }
            launch { pAI.animateTo(0f, BUBBLE_OUT) }
            launch { rot.animateTo(0f, ROT_SPRING) }
            launch { scrim.animateTo(0f, tween(180)) }
            delay(220)
            onDismiss()
        }
    }

    fun pick(tapped: Animatable<Float, AnimationVector1D>, other: Animatable<Float, AnimationVector1D>) {
        if (closing) return
        closing = true
        scope.launch {
            launch {
                tapped.animateTo(1.12f, tween(90))
                tapped.animateTo(0f, tween(130))
            }
            launch { other.animateTo(0f, BUBBLE_OUT) }
            launch { rot.animateTo(0f, ROT_SPRING) }
            launch { scrim.animateTo(0f, tween(160)) }
            delay(200)
            onDismiss()
            onPick()
        }
    }

    Dialog(
        onDismissRequest = ::close,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            // + 号圆心（对齐底栏 FAB：右内边 16 + 间隙 10 + 半径 26 → 距右 42，距底 38）
            val cx = maxWidth - 42.dp
            val cy = maxHeight - 38.dp

            // 轻蒙层：点按取消（对齐 rgba(8,18,28,0.16)）
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color(0x08121C).copy(alpha = 0.16f * scrim.value))
                    .clickable { close() },
            )

            BubbleBall(
                icon = "⚡",
                title = "快速模式",
                progress = pQuick.value,
                phi = QUICK_PHI,
                cx = cx,
                cy = cy,
                onClick = { pick(pQuick, pAI) },
            )
            BubbleBall(
                icon = "🤖",
                title = "AI智能\n生成行程",
                progress = pAI.value,
                phi = AI_PHI,
                cx = cx,
                cy = cy,
                onClick = { pick(pAI, pQuick) },
            )

            // + 旋转成 × 的关闭钮，盖在原 FAB 位置
            Box(
                Modifier
                    .offset { IntOffset((cx - 26.dp).roundToPx(), (cy - 26.dp).roundToPx()) }
                    .size(52.dp)
                    .shadow(10.dp, CircleShape)
                    .clip(CircleShape)
                    .background(ZhijingColors.Brand)
                    .clickable { close() },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.graphicsLayer { rotationZ = rot.value }) {
                    Box(
                        Modifier.size(width = 18.dp, height = 2.5.dp)
                            .align(Alignment.Center)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Color.White),
                    )
                    Box(
                        Modifier.size(width = 2.5.dp, height = 18.dp)
                            .align(Alignment.Center)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Color.White),
                    )
                }
            }
        }
    }
}

/** 单颗肥皂泡：沿弧线从 + 圆心滑出（半径/角度/缩放/透明度均由 progress 驱动） */
@Composable
private fun BubbleBall(
    icon: String,
    title: String,
    progress: Float,
    phi: Double,
    cx: Dp,
    cy: Dp,
    onClick: () -> Unit,
) {
    val p = progress.coerceAtLeast(0f)
    val angle = (START_PHI + (phi - START_PHI) * p) * PI / 180.0
    val r = BUBBLE_R_DP * p
    val x = cx + (r * sin(angle)).toFloat().dp
    val y = cy - (r * cos(angle)).toFloat().dp

    Box(
        Modifier
            .offset {
                IntOffset(
                    ((x - (BUBBLE_D_DP / 2).dp).roundToPx()),
                    ((y - (BUBBLE_D_DP / 2).dp).roundToPx()),
                )
            }
            .size(BUBBLE_D_DP.dp)
            .graphicsLayer {
                scaleX = p
                scaleY = p
                alpha = (p * 2.2f).coerceAtMost(1f)
            },
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(id = R.drawable.bubble),
            contentDescription = null,
            modifier = Modifier.size((BUBBLE_D_DP * 1.16f).dp),
            contentScale = ContentScale.Fit,
        )
        Column(
            Modifier.clickable(onClick = onClick),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(icon, fontSize = 28.sp)
            Spacer(Modifier.height(4.dp))
            Text(
                title,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF2B4A63),
                textAlign = TextAlign.Center,
                lineHeight = 18.sp,
            )
        }
    }
}
/** 白色胶囊底栏：浅蓝气泡滑到当前 Tab（对齐 RN CustomTabBar 简化版） */
@Composable
private fun ZhijingTabBar(
    active: MainTab,
    onChange: (MainTab) -> Unit,
    onPlus: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BoxWithConstraints(
            Modifier
                .weight(1f)
                .height(52.dp)
                .shadow(10.dp, RoundedCornerShape(30.dp))
                .clip(RoundedCornerShape(30.dp))
                .background(Color.White),
        ) {
            val tabW = maxWidth / 3
            val blobX by animateDpAsState(
                targetValue = tabW * active.ordinal,
                animationSpec = spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow),
                label = "tabBlob",
            )
            Box(Modifier.fillMaxSize()) {
                Box(
                    Modifier
                        .offset(x = blobX)
                        .width(tabW)
                        .fillMaxHeight()
                        .padding(vertical = 6.dp)
                        .padding(horizontal = 4.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(Color(0xFFE8F4FC)),
                )
            }
            Row(Modifier.fillMaxSize()) {
                MainTab.entries.forEach { t ->
                    Box(
                        Modifier.weight(1f).fillMaxHeight().clickable { onChange(t) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            TAB_LABELS.getValue(t),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (t == active) ZhijingColors.BrandHot else ZhijingColors.Ink,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.width(10.dp))
        Box(
            Modifier
                .size(52.dp)
                .shadow(10.dp, CircleShape)
                .clip(CircleShape)
                .background(ZhijingColors.Brand)
                .clickable { onPlus() },
            contentAlignment = Alignment.Center,
        ) {
            Text("+", fontSize = 26.sp, color = Color.White, fontWeight = FontWeight.Light)
        }
    }
}
