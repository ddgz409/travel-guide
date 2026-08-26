package com.travelguide.app.ui.screens.explore

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.MapView
import com.amap.api.maps.model.BitmapDescriptorFactory
import com.amap.api.maps.model.Circle
import com.amap.api.maps.model.CircleOptions
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.Marker
import com.amap.api.maps.model.MarkerOptions
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CollectionSummary
import com.travelguide.app.data.model.CITY_CATALOG
import com.travelguide.app.data.model.matchCities
import com.travelguide.app.data.util.wgs84ToGcj02
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

private data class ExploreDest(val name: String, val desc: String, val landmark: String)

/** 设备定位结果（含精度与来源，精度用于水波半径，来源用于验证角标） */
private data class DeviceLocation(
    val lat: Double,
    val lng: Double,
    val accuracy: Float,
    val source: String = "",
)

/** 与 RN Explore content.ts 的 DESTINATIONS 对齐 */
private val DESTINATIONS = listOf(
    ExploreDest("北京", "故宫长城 · 皇城根下", "故宫博物院"),
    ExploreDest("成都", "熊猫火锅 · 慢生活", "大熊猫繁育研究基地"),
    ExploreDest("杭州", "西湖龙井 · 江南烟雨", "西湖"),
    ExploreDest("大理", "风花雪月 · 苍山洱海", "洱海"),
    ExploreDest("西安", "兵马俑 · 古城墙", "秦始皇兵马俑博物馆"),
    ExploreDest("厦门", "鼓浪屿 · 海边慢行", "鼓浪屿"),
    ExploreDest("上海", "外滩夜景 · 魔都节奏", "外滩"),
    ExploreDest("三亚", "热带海岛 · 阳光沙滩", "亚龙湾"),
)

private val INTERESTS = listOf("美食", "人文历史", "自然风光", "亲子", "摄影", "购物")

private val CARD_COLORS = listOf(
    Color(0xFFE8E4F8), Color(0xFFD7EAF8), Color(0xFFE4F0D8), Color(0xFFF8E8D8), Color(0xFFF5E0EC),
)
private val SHORTCUT_COLORS = listOf(Color(0xFFDCEBFA), Color(0xFFFDE9D9), Color(0xFFE3F4E1))

/**
 * 探索页（对齐 RN ExploreScreen）：
 * 原生高德地图打底 + 可拖拽底部面板（搜索 / 快捷入口 / 兴趣 / 热门目的地 / 最新共享收藏夹）。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExploreScreen(
    active: Boolean,
    onOpenMe: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenChat: () -> Unit,
    onOpenGenerate: (String?) -> Unit,
    onOpenCityGuide: (String) -> Unit,
    onOpenSharedCollections: () -> Unit,
    onOpenCollectionDetail: (String) -> Unit,
    onOpenUserProfile: (String, String) -> Unit,
    onOpenTravelSearch: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var q by remember { mutableStateOf("") }
    var collections by remember { mutableStateOf(emptyList<CollectionSummary>()) }
    var collectionsLoading by remember { mutableStateOf(false) }
    var locCity by remember { mutableStateOf<String?>(null) }
    var locPoint by remember { mutableStateOf<DeviceLocation?>(null) }
    var locLoading by remember { mutableStateOf(false) }
    // 手动点「定位」的计数：驱动相机回中（坐标即使没变也要回中，对齐 RN 行为）
    var focusSeq by remember { mutableIntStateOf(0) }

    fun loadCollections() {
        scope.launch {
            collectionsLoading = true
            collections = runCatching { ApiClient.collections.list(8).items }.getOrDefault(emptyList())
            collectionsLoading = false
        }
    }

    fun fetchLocation(manual: Boolean) {
        scope.launch {
            locLoading = true
            try {
                // 手动点「定位」跳过缓存、开高精度模式（对齐 RN getFreshDeviceLocation 的 BestForNavigation）
                val coord = withContext(Dispatchers.IO) {
                    fetchDeviceLocation(context, fresh = manual, highAccuracy = manual)
                }
                if (coord != null) {
                    // coord 已在 fetchDeviceLocation 内统一纠偏为 GCJ-02（对齐 RN locFromPosition）
                    locPoint = coord
                    if (manual) focusSeq++
                    val city = runCatching {
                        ApiClient.destinations.regeo(coord.lng, coord.lat).city
                    }.getOrNull()
                    if (!city.isNullOrBlank()) locCity = city
                }
            } finally {
                locLoading = false
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) fetchLocation(manual = false) }

    LaunchedEffect(Unit) {
        loadCollections()
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) fetchLocation(manual = false) else permissionLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
    }

    // 切回探索页时刷新共享列表（对齐 RN useFocusEffect）
    LaunchedEffect(active) { if (active) loadCollections() }

    Box(Modifier.fillMaxSize()) {
        ExploreMapBackdrop()
        ExploreSheet(
            q = q,
            onQChange = { q = it },
            locCity = locCity,
            locLoading = locLoading,
            collections = collections,
            collectionsLoading = collectionsLoading,
            onSearch = { query -> if (query.isNotBlank()) onOpenGenerate(query) },
            onPickCity = { city -> onOpenCityGuide(city) },
            onOpenChat = onOpenChat,
            onOpenSharedCollections = onOpenSharedCollections,
            onOpenTravelSearch = onOpenTravelSearch,
            onOpenInterest = { onOpenGenerate(null) },
            onOpenGenerateAll = { onOpenGenerate(null) },
            onOpenCollectionDetail = onOpenCollectionDetail,
            onOpenUserProfile = onOpenUserProfile,
        )

        // 顶栏：头像（进我的）/ 设置
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(38.dp)
                    .shadow(6.dp, CircleShape)
                    .clip(CircleShape)
                    .background(ZhijingColors.BrandSoft)
                    .clickable { onOpenMe() },
                contentAlignment = Alignment.Center,
            ) { Text("🧭", fontSize = 18.sp) }
            Box(
                Modifier
                    .size(38.dp)
                    .shadow(6.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White)
                    .clickable { onOpenSettings() },
                contentAlignment = Alignment.Center,
            ) { Text("⚙", fontSize = 18.sp) }
        }

        // 地图控制区：定位按钮（对齐 RN mapCtrlBtn：白底细边十字准星）
        Column(
            Modifier.align(Alignment.TopEnd).padding(top = 64.dp, end = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .shadow(6.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White)
                    .border(1.dp, ZhijingColors.Line, CircleShape)
                    .clickable(enabled = !locLoading) { fetchLocation(manual = true) },
                contentAlignment = Alignment.Center,
            ) {
                if (locLoading) {
                    CircularProgressIndicator(Modifier.size(16.dp), color = ZhijingColors.BrandHot, strokeWidth = 2.dp)
                } else {
                    LocateIcon()
                }
            }
        }
    }
}

/** 定位图标（对齐 RN MapLocateIcon：圆环 + 中心点 + 四向刻度） */
@Composable
private fun LocateIcon(size: androidx.compose.ui.unit.Dp = 18.dp, color: Color = Color(0xFF1A66FF)) {
    val stroke = 2.dp
    val tick = 3.dp
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(size * 0.68f)
                .border(stroke, color, CircleShape),
        )
        Box(Modifier.size(size * 0.24f).clip(CircleShape).background(color))
        Box(Modifier.align(Alignment.TopCenter).size(width = stroke, height = tick).background(color))
        Box(Modifier.align(Alignment.BottomCenter).size(width = stroke, height = tick).background(color))
        Box(Modifier.align(Alignment.CenterStart).size(width = tick, height = stroke).background(color))
        Box(Modifier.align(Alignment.CenterEnd).size(width = tick, height = stroke).background(color))
    }
}

/** 全屏原生高德地图（替代 RN WebView 版）。
 * 定位蓝点/水波纹暂时下线：定位精度问题待排查（用户指示），坐标仍用于城市反查。 */
@Composable
private fun ExploreMapBackdrop() {
    val context = LocalContext.current
    val mapView = remember { MapView(context).apply { onCreate(Bundle()) } }
    DisposableEffect(Unit) {
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onDestroy()
        }
    }
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = {
            mapView.apply {
                map?.let { aMap ->
                    aMap.uiSettings.apply {
                        isZoomControlsEnabled = false
                        isMyLocationButtonEnabled = false
                        isCompassEnabled = false
                    }
                    // 无定位时给个全国视野，避免默认北京造成误解
                    aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(35.0, 105.0), 4.2f))
                }
            }
        },
    )
}

// ---------- 可拖拽底部面板 ----------

private val SHEET_ANCHORS = floatArrayOf(0.34f, 0.6f, 0.92f)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExploreSheet(
    q: String,
    onQChange: (String) -> Unit,
    locCity: String?,
    locLoading: Boolean,
    collections: List<CollectionSummary>,
    collectionsLoading: Boolean,
    onSearch: (String) -> Unit,
    onPickCity: (String) -> Unit,
    onOpenChat: () -> Unit,
    onOpenSharedCollections: () -> Unit,
    onOpenTravelSearch: () -> Unit,
    onOpenInterest: (String) -> Unit,
    onOpenGenerateAll: () -> Unit,
    onOpenCollectionDetail: (String) -> Unit,
    onOpenUserProfile: (String, String) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val fullH = maxHeight
        val density = LocalDensity.current
        val fullHPx = with(density) { fullH.toPx() }
        var frac by remember { mutableFloatStateOf(0.6f) }
        val animatedFrac by androidx.compose.animation.core.animateFloatAsState(
            targetValue = frac,
            animationSpec = androidx.compose.animation.core.spring(
                dampingRatio = 0.82f,
                stiffness = 320f,
            ),
            label = "sheetFrac",
        )

        fun snap() {
            frac = SHEET_ANCHORS.minByOrNull { kotlin.math.abs(it - frac) } ?: 0.6f
        }

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(fullH * animatedFrac)
                .shadow(14.dp, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .background(ZhijingColors.Bg),
        ) {
            // 拖拽区：把手 + 标题 + 搜索
            Column(
                Modifier
                    .fillMaxWidth()
                    .pointerInput(fullHPx) {
                        detectVerticalDragGestures(
                            onDragEnd = { snap() },
                            onDragCancel = { snap() },
                            onVerticalDrag = { change, drag ->
                                change.consume()
                                frac = (frac - drag / fullHPx).coerceIn(SHEET_ANCHORS.first(), SHEET_ANCHORS.last())
                            },
                        )
                    }
                    .padding(horizontal = 18.dp),
            ) {
                Box(
                    Modifier.padding(top = 10.dp, bottom = 8.dp).size(width = 38.dp, height = 4.dp)
                        .align(Alignment.CenterHorizontally)
                        .clip(RoundedCornerShape(2.dp))
                        .background(ZhijingColors.Line),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        locCity ?: "探索",
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f, fill = false),
                        maxLines = 1,
                    )
                    if (locCity != null) {
                        Spacer(Modifier.width(8.dp))
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(ZhijingColors.BrandSoft)
                                .clickable { onPickCity(locCity) }
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("附近发现", fontSize = 12.sp, color = ZhijingColors.BrandHot, fontWeight = FontWeight.SemiBold)
                            Text(" ›", fontSize = 12.sp, color = ZhijingColors.BrandHot)
                        }
                    }
                }
                if (locCity == null) {
                    Spacer(Modifier.height(3.dp))
                    Text(
                        if (locLoading) "正在获取你的位置…" else "搜目的地，或从下方选城市开始规划",
                        fontSize = 12.sp,
                        color = ZhijingColors.Muted,
                        maxLines = 2,
                    )
                }
                Spacer(Modifier.height(10.dp))
                ExploreSearchBox(q = q, onQChange = onQChange, onSearch = { onSearch(q.trim()) })
                Spacer(Modifier.height(8.dp))
            }

            // 可滚动内容
            LazyColumn(
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 110.dp),
                modifier = Modifier.weight(1f),
            ) {
                // 城市联想面板（matches 在 LazyColumn 外 remember，避免非 Composable 作用域）
                val query = q.trim()
                val showPanel = query.isNotEmpty()
                if (showPanel) {
                    item {
                        val matches = remember(query) { matchCities(query, 24) }
                        Text("你是不是想找", fontSize = 12.sp, color = ZhijingColors.Muted)
                        Spacer(Modifier.height(6.dp))
                        if (matches.isEmpty()) {
                            Text("没有匹配城市，可直接搜索", fontSize = 13.sp, color = ZhijingColors.Muted)
                        } else {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                matches.forEach { name ->
                                    Box(
                                        Modifier
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(ZhijingColors.BgSurface)
                                            .clickable { onPickCity(name) }
                                            .padding(horizontal = 13.dp, vertical = 7.dp),
                                    ) {
                                        Text(name, fontSize = 13.sp, color = ZhijingColors.Ink)
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }

                // 快捷入口
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        ShortcutCard("AI 助手", "旅游问题随时问", SHORTCUT_COLORS[0], Modifier.weight(1f), onOpenChat)
                        ShortcutCard("大家的收藏", "订阅旅友清单", SHORTCUT_COLORS[1], Modifier.weight(1f), onOpenSharedCollections)
                        ShortcutCard("出行搜索", "机票火车票比价", SHORTCUT_COLORS[2], Modifier.weight(1f), onOpenTravelSearch)
                    }
                    Spacer(Modifier.height(18.dp))
                }

                // 按兴趣出发
                item {
                    Text("按兴趣出发", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        INTERESTS.forEach { tag ->
                            Box(
                                Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(ZhijingColors.BgSurface)
                                    .clickable { onOpenInterest(tag) }
                                    .padding(horizontal = 14.dp, vertical = 7.dp),
                            ) {
                                Text(tag, fontSize = 13.sp, color = ZhijingColors.Ink)
                            }
                        }
                    }
                    Spacer(Modifier.height(18.dp))
                }

                // 热门目的地
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("热门目的地", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "AI 生成 →",
                            fontSize = 13.sp,
                            color = ZhijingColors.BrandHot,
                            modifier = Modifier.clickable { onOpenGenerateAll() },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
                DESTINATIONS.chunked(2).forEachIndexed { rowIdx, pair ->
                    item(key = "dest_$rowIdx") {
                        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            pair.forEachIndexed { i, d ->
                                DestCard(
                                    dest = d,
                                    color = CARD_COLORS[(rowIdx * 2 + i) % CARD_COLORS.size],
                                    modifier = Modifier.weight(1f),
                                    onClick = { onPickCity(d.name) },
                                )
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(9.dp))
                    }
                }

                // 最新共享
                item {
                    Spacer(Modifier.height(9.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("最新共享", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "查看全部 →",
                            fontSize = 13.sp,
                            color = ZhijingColors.BrandHot,
                            modifier = Modifier.clickable { onOpenSharedCollections() },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    if (collectionsLoading && collections.isEmpty()) {
                        Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = ZhijingColors.BrandHot, strokeWidth = 2.dp)
                        }
                    }
                }
                items(collections, key = { it.id }) { item ->
                    CollectionCard(
                        item = item,
                        onPress = { onOpenCollectionDetail(item.id) },
                        onAuthorPress = item.authorId?.let { uid ->
                            { onOpenUserProfile(uid, item.authorDisplay) }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ExploreSearchBox(q: String, onQChange: (String) -> Unit, onSearch: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.BgSurface)
            .padding(start = 14.dp, top = 4.dp, bottom = 4.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = q,
            onValueChange = onQChange,
            modifier = Modifier.weight(1f).padding(vertical = 9.dp),
            singleLine = true,
            textStyle = androidx.compose.ui.text.TextStyle(
                fontSize = 14.sp,
                color = ZhijingColors.Ink,
            ),
            cursorBrush = SolidColor(ZhijingColors.BrandHot),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            decorationBox = { inner ->
                if (q.isEmpty()) {
                    Text("搜目的地，或从下方选城市", fontSize = 14.sp, color = ZhijingColors.Muted)
                }
                inner()
            },
        )
        Box(
            Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(ZhijingColors.BrandHot)
                .clickable { onSearch() }
                .padding(horizontal = 16.dp, vertical = 9.dp),
        ) {
            Text("搜索", fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ShortcutCard(
    title: String,
    desc: String,
    bg: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bg)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Text(title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        Spacer(Modifier.height(3.dp))
        Text(desc, fontSize = 11.sp, color = ZhijingColors.Muted, maxLines = 1)
    }
}

@Composable
private fun DestCard(dest: ExploreDest, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(color)
            .clickable { onClick() }
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(dest.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Spacer(Modifier.height(3.dp))
            Text(dest.desc, fontSize = 11.sp, color = ZhijingColors.Muted, maxLines = 2)
        }
        Spacer(Modifier.width(8.dp))
        DestCover(city = dest.name, landmark = dest.landmark)
    }
}

@Composable
private fun DestCover(city: String, landmark: String) {
    val url = rememberPlaceImage(city, landmark, "spots")
    Box(
        Modifier
            .size(54.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(ZhijingColors.BrandSoft),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = landmark,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text("🏞", fontSize = 20.sp)
        }
    }
}

// ---------- 定位：双路竞速（GPS 准但慢/室内无信号，网络快但有基站误差） ----------
// 策略：新鲜的 lastKnown 直接用；否则 GPS/NETWORK 同时监听，
//   快且准（≤60m）立即采纳，否则等到 10 秒收最好的结果；超时兜底旧 lastKnown。

private const val FRESH_MAX_ACCURACY_M = 80f
private const val FRESH_MAX_AGE_MS = 5 * 60 * 1000L

/** 立即采纳的精度阈值：常规 ≤40 米；手动高精度定位 ≤20 米（等到更好的结果而不是抢第一个） */
private const val GOOD_ACCURACY_M = 40f
private const val HIGH_ACCURACY_M = 20f

private fun isFreshEnough(loc: Location?): Boolean =
    loc != null &&
        loc.accuracy in 0f..FRESH_MAX_ACCURACY_M &&
        System.currentTimeMillis() - loc.time <= FRESH_MAX_AGE_MS

/**
 * 统一输出 GCJ-02：对齐 RN utils/location.ts 的 locFromPosition——
 * 不管什么来源，一律做 wgs84ToGcj02（RN 在真机上定位准确，即该管线与设备输出匹配）。
 */
private fun toGcj02(loc: Location): DeviceLocation {
    val (lat, lng) = wgs84ToGcj02(loc.latitude, loc.longitude)
    return DeviceLocation(lat, lng, loc.accuracy, loc.provider.orEmpty())
}

private suspend fun fetchDeviceLocation(context: Context, fresh: Boolean = false, highAccuracy: Boolean = false): DeviceLocation? {
    val granted = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    if (!granted) return null

    val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    // 候选池：新鲜的 lastKnown 可直接采纳；旧的留作兜底（总比没有强）
    val candidates = runCatching {
        listOfNotNull(
            lm.getLastKnownLocation(LocationManager.GPS_PROVIDER),
            lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER),
        )
    }.getOrDefault(emptyList())
    // 主动点「定位」跳过缓存快读，强制重新实时定位（对齐 RN getFreshDeviceLocation）
    if (!fresh) {
        candidates.filter(::isFreshEnough).minByOrNull { it.accuracy }?.let { return toGcj02(it) }
    }
    val staleFallback = candidates.minByOrNull { it.accuracy }

    // 双路竞速：GPS 与 NETWORK 都可用则同时监听，先到且够准者胜；
    // LocationManager 返回 WGS-84 原始坐标，纠偏在上层统一做。
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
    if (providers.isEmpty()) {
        return staleFallback?.let { toGcj02(it) }
    }

    val result = withTimeoutOrNull(if (highAccuracy) 25000 else 12000) {
        coroutineScope {
            suspendCancellableCoroutine { cont ->
                var best: Location? = null
                val listeners = mutableListOf<LocationListener>()
                var earlyStop: Job? = null

                fun finish(loc: DeviceLocation) {
                    earlyStop?.cancel()
                    listeners.forEach { runCatching { lm.removeUpdates(it) } }
                    if (cont.isActive) cont.resume(loc)
                }

                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        // 快且准：立即采纳（高精度模式阈值更严，宁等勿凑合）
                        if (location.accuracy <= if (highAccuracy) HIGH_ACCURACY_M else GOOD_ACCURACY_M) {
                            finish(toGcj02(location))
                            return
                        }
                        // 不够准：记下最好的，等后续更准的或提前结束采用
                        if (best == null || location.accuracy < best!!.accuracy) best = location
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                }
                listeners += listener

                cont.invokeOnCancellation {
                    earlyStop?.cancel()
                    listeners.forEach { runCatching { lm.removeUpdates(it) } }
                }

                val ok = providers.map { p ->
                    runCatching {
                        @Suppress("DEPRECATION")
                        lm.requestLocationUpdates(p, 0L, 0f, listener)
                    }.isSuccess
                }
                if (ok.none { it }) {
                    if (cont.isActive) cont.resume(null)
                    return@suspendCancellableCoroutine
                }

                // 高精度模式多等一会儿（GPS 冷启动需要时间）；常规 6 秒还没拿到够准的，就用目前最好的提前结束
                earlyStop = launch {
                    delay(if (highAccuracy) 15000 else 6000)
                    val b = best
                    if (b != null) finish(toGcj02(b))
                }
            }
        }
    }
    // 超时时兜底：旧 lastKnown 也比空手好（蓝点先大致到位，下次定位再修正）
    return result ?: staleFallback?.let { toGcj02(it) }
}
