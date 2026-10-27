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
import androidx.compose.runtime.SideEffect
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
import com.travelguide.app.ui.components.rememberAmapMapView
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
import com.travelguide.app.data.util.DeviceLocation
import com.travelguide.app.data.util.LocationCache
import com.travelguide.app.data.util.fetchDeviceLocation
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

private data class ExploreDest(
    val name: String,
    val desc: String,
    val landmark: String,
    /** 本地兜底图 assets/dest_covers/{coverKey}.jpg；优先走高德主图 API */
    val coverKey: String = "",
)

/** 与 RN Explore content.ts 的 DESTINATIONS 对齐；封面优先拉高德 POI 主图 */
private val DESTINATIONS = listOf(
    ExploreDest("北京", "故宫长城 · 皇城根下", "故宫博物院", "beijing"),
    ExploreDest("成都", "熊猫火锅 · 慢生活", "大熊猫繁育研究基地", "chengdu"),
    ExploreDest("杭州", "西湖龙井 · 江南烟雨", "西湖", "hangzhou"),
    ExploreDest("大理", "风花雪月 · 苍山洱海", "洱海", "dali"),
    ExploreDest("西安", "兵马俑 · 古城墙", "秦始皇兵马俑博物馆", "xian"),
    ExploreDest("厦门", "鼓浪屿 · 海边慢行", "鼓浪屿", "xiamen"),
    ExploreDest("上海", "外滩夜景 · 魔都节奏", "外滩", "shanghai"),
    ExploreDest("三亚", "热带海岛 · 阳光沙滩", "亚龙湾", "sanya"),
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
    var locCity by remember { mutableStateOf(LocationCache.city?.takeIf { it.isNotBlank() }) }
    var locPoint by remember { mutableStateOf<DeviceLocation?>(LocationCache.location) }
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

    suspend fun resolveCity(coord: DeviceLocation): String? = withContext(Dispatchers.IO) {
        runCatching { ApiClient.destinations.regeo(coord.lng, coord.lat).city }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
    }

    fun fetchLocation(manual: Boolean) {
        if (locLoading) return
        scope.launch {
            locLoading = true
            try {
                // 手动点「定位」跳过缓存、开高精度模式（对齐 RN getFreshDeviceLocation 的 BestForNavigation）
                val coord = withContext(Dispatchers.IO) {
                    fetchDeviceLocation(context, fresh = manual, highAccuracy = manual)
                } ?: locPoint
                if (coord != null) {
                    locPoint = coord
                    if (manual) focusSeq++
                    val city = resolveCity(coord)
                    if (!city.isNullOrBlank()) {
                        locCity = city
                        LocationCache.remember(coord, city)
                    }
                }
            } finally {
                locLoading = false
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        val granted = results[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (granted) fetchLocation(manual = false)
    }

    fun ensureLocationPermission(): Boolean {
        val coarse = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val fine = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        return coarse || fine
    }

    LaunchedEffect(Unit) {
        loadCollections()
        if (ensureLocationPermission()) {
            fetchLocation(manual = false)
        } else {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ),
            )
        }
    }

    // 切回探索页：刷新列表；若城市仍空则重试（配额恢复/首次 regeo 失败后自动恢复）
    LaunchedEffect(active) {
        if (!active) return@LaunchedEffect
        loadCollections()
        if (locCity == null && ensureLocationPermission() && !locLoading) {
            fetchLocation(manual = false)
        } else if (locCity == null && locPoint != null && !locLoading) {
            locLoading = true
            try {
                val city = resolveCity(locPoint!!)
                if (!city.isNullOrBlank()) {
                    locCity = city
                    LocationCache.remember(locPoint!!, city)
                }
            } finally {
                locLoading = false
            }
        }
    }

    var sheetFrac by remember { mutableFloatStateOf(0.6f) }

    Box(Modifier.fillMaxSize()) {
        ExploreMapBackdrop(
            locPoint = locPoint,
            focusSeq = focusSeq,
            sheetFraction = sheetFrac,
        )
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
            onSheetFractionChange = { sheetFrac = it },
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

/** 全屏原生高德地图：定位点落在「面板上方可见区域」正中，避免被底部 sheet 挡住。 */
@Composable
private fun ExploreMapBackdrop(
    locPoint: DeviceLocation?,
    focusSeq: Int,
    sheetFraction: Float,
) {
    val mapView = rememberAmapMapView()
    var userMarker by remember { mutableStateOf<Marker?>(null) }
    var userCircle by remember { mutableStateOf<Circle?>(null) }

    fun centerCamera(aMap: AMap, view: MapView, latLng: LatLng) {
        view.post {
            val w = view.width
            val h = view.height
            if (w > 0 && h > 0) {
                val frac = sheetFraction.coerceIn(0.2f, 0.92f)
                // 面板占底部 frac；定位点放在上方可见区垂直居中
                val centerY = (h * (1f - frac) / 2f).toInt().coerceIn(h / 10, h / 2)
                aMap.setPointToCenter(w / 2, centerY)
            }
            aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(latLng, 15f))
        }
    }

    fun drawUserLocation(aMap: AMap, loc: DeviceLocation) {
        val latLng = LatLng(loc.lat, loc.lng)
        userMarker?.remove()
        userCircle?.remove()
        userMarker = aMap.addMarker(
            MarkerOptions()
                .position(latLng)
                .anchor(0.5f, 0.5f)
                .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE)),
        )
        val radius = loc.accuracy.coerceIn(25f, 180f).toDouble()
        userCircle = aMap.addCircle(
            CircleOptions()
                .center(latLng)
                .radius(radius)
                .fillColor(0x331A66FF.toInt())
                .strokeColor(0x991A66FF.toInt())
                .strokeWidth(1f),
        )
        centerCamera(aMap, mapView, latLng)
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
                    if (locPoint == null) {
                        aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(35.0, 105.0), 4.2f))
                    }
                }
            }
        },
    )

    LaunchedEffect(locPoint?.lat, locPoint?.lng, locPoint?.accuracy, focusSeq, sheetFraction) {
        val loc = locPoint ?: return@LaunchedEffect
        repeat(8) {
            mapView.map?.let { aMap ->
                drawUserLocation(aMap, loc)
                return@LaunchedEffect
            }
            delay(80)
        }
    }
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
    onSheetFractionChange: (Float) -> Unit = {},
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
        SideEffect { onSheetFractionChange(animatedFrac) }

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
        DestCover(city = dest.name, landmark = dest.landmark, coverKey = dest.coverKey)
    }
}

@Composable
private fun DestCover(city: String, landmark: String, coverKey: String) {
    val context = androidx.compose.ui.platform.LocalContext.current
    // 优先高德 POI 主图；失败再用本地兜底，避免空白
    val remote = rememberPlaceImage(city, landmark, "spots")
    val model: Any? = when {
        remote != null -> remote
        coverKey.isNotBlank() -> "file:///android_asset/dest_covers/$coverKey.jpg"
        else -> null
    }
    Box(
        Modifier
            .size(54.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(ZhijingColors.BrandSoft),
        contentAlignment = Alignment.Center,
    ) {
        if (model != null) {
            AsyncImage(
                model = coil.request.ImageRequest.Builder(context)
                    .data(model)
                    .memoryCacheKey("dest_${city}_$landmark")
                    .diskCacheKey("dest_${city}_$landmark")
                    .crossfade(false)
                    .build(),
                contentDescription = landmark,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text("🏞", fontSize = 20.sp)
        }
    }
}

// 定位实现已提取到 data/util/DeviceLocation.kt（fetchDeviceLocation，探索页与添加足迹共用）
