package com.travelguide.app.ui.screens.city

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CitySpotDto
import com.travelguide.app.data.local.CityInfoCache
import com.travelguide.app.data.local.LocationPrefs
import com.travelguide.app.data.util.CITY_EXPLORE_CATEGORIES
import com.travelguide.app.data.util.CityExploreCategory
import com.travelguide.app.data.util.DeviceLocation
import com.travelguide.app.data.util.LocationCache
import com.travelguide.app.data.util.buildCityPoiMarkers
import com.travelguide.app.data.util.buildLocalCityPreview
import com.travelguide.app.data.util.cityCoord
import com.travelguide.app.data.util.cityIntro
import com.travelguide.app.data.util.fakePopularity
import com.travelguide.app.data.util.fetchDeviceLocation
import com.travelguide.app.data.util.openXiaohongshuSearch
import com.travelguide.app.data.util.xhsCategoryKeyword
import com.travelguide.app.ui.components.CityExploreMap
import com.travelguide.app.ui.components.DraggableBottomSheet
import com.travelguide.app.ui.components.PoiDetailSheet
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 城市详情（对齐 RN CityDetailScreen）：全屏地图 + 分类筛选 + 可拖抽屉 + 打卡 POI 详情。
 */
@Composable
fun CityDetailScreen(
    city: String,
    onBack: () -> Unit,
    onOpenGenerate: (String, List<String>?, String?) -> Unit,
    onOpenChat: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var foods by remember { mutableStateOf(emptyList<CitySpotDto>()) }
    var spots by remember { mutableStateOf(emptyList<CitySpotDto>()) }
    var categoryKey by remember { mutableStateOf("spots") }
    var selected by remember { mutableStateOf<CitySpotDto?>(null) }
    var userLocation by remember { mutableStateOf<DeviceLocation?>(LocationCache.location) }
    var locating by remember { mutableStateOf(false) }
    var focusSeq by remember { mutableIntStateOf(0) }
    var sheetFraction by remember { mutableFloatStateOf(0.52f) }

    val localPreview = remember(city) { buildLocalCityPreview(city) }
    val baseCoord = remember(city) { cityCoord(city) }

    suspend fun applyResult(foodsList: List<CitySpotDto>, spotsList: List<CitySpotDto>) {
        foods = foodsList
        spots = spotsList
        categoryKey = when {
            spotsList.isNotEmpty() -> "spots"
            foodsList.isNotEmpty() -> "foods"
            else -> categoryKey
        }
    }

    suspend fun loadCity() {
        error = null
        val cached = CityInfoCache.get(city)
        val hasCache = cached != null && (cached.foods.isNotEmpty() || cached.spots.isNotEmpty())
        when {
            hasCache -> {
                applyResult(cached!!.foods, cached.spots)
                loading = false
                refreshing = false
            }
            localPreview != null -> {
                applyResult(localPreview.foods, localPreview.spots)
                loading = false
                refreshing = true
            }
            else -> {
                loading = true
                refreshing = false
            }
        }
        try {
            val result = withContext(Dispatchers.IO) { ApiClient.destinations.info(city) }
            applyResult(result.foods, result.spots)
            error = null
            if (result.foods.isNotEmpty() || result.spots.isNotEmpty()) {
                CityInfoCache.set(city, result)
            }
        } catch (e: Exception) {
            if (!hasCache && localPreview == null) {
                error = e.message ?: "加载失败，请重试"
            }
        } finally {
            loading = false
            refreshing = false
        }
    }

    LaunchedEffect(city) { loadCity() }

    LaunchedEffect(Unit) {
        if (LocationPrefs.consentSync() == "denied") return@LaunchedEffect
        runCatching {
            val loc = fetchDeviceLocation(context, highAccuracy = false)
            if (loc != null) {
                LocationCache.remember(loc, LocationCache.city)
                userLocation = loc
            }
        }
    }

    val category = CITY_EXPLORE_CATEGORIES.firstOrNull { it.key == categoryKey }
        ?: CITY_EXPLORE_CATEGORIES.first()
    val activeItems = if (categoryKey == "foods") foods else spots
    val mapMarkers = remember(activeItems, category, baseCoord) {
        buildCityPoiMarkers(activeItems, category, baseCoord)
    }
    val intro = remember(city, spots) { cityIntro(city, spots.mapNotNull { it.desc.takeIf { d -> d.isNotBlank() } }) }
    val isEmpty = !loading && error == null && foods.isEmpty() && spots.isEmpty()

    when {
        loading && foods.isEmpty() && spots.isEmpty() -> {
            CityDetailOverlay(city = city, onBack = onBack) {
                CityInfoLoadingPane(city)
            }
        }
        error != null && foods.isEmpty() && spots.isEmpty() -> {
            CityDetailOverlay(city = city, onBack = onBack) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(error!!, color = ZhijingColors.Danger, fontSize = 14.sp)
                    Spacer(Modifier.height(12.dp))
                    RetryButton("重试") { scope.launch { loadCity() } }
                }
            }
        }
        isEmpty -> {
            CityDetailOverlay(city = city, onBack = onBack) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("暂无 $city 的相关信息", color = ZhijingColors.Muted, fontSize = 14.sp)
                    Spacer(Modifier.height(12.dp))
                    RetryButton("重新搜索") { scope.launch { loadCity() } }
                }
            }
        }
        else -> {
            Box(Modifier.fillMaxSize()) {
                CityExploreMap(
                    markers = mapMarkers,
                    userLocation = userLocation,
                    sheetFraction = sheetFraction,
                    focusSeq = focusSeq,
                    onMarkerClick = { selected = it.item },
                )

                // 顶栏
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                        .align(Alignment.TopStart),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FloatingIconButton("‹", onBack)
                    Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                        Text(city, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (refreshing) {
                                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = ZhijingColors.Brand)
                                Spacer(Modifier.width(6.dp))
                                Text("正在更新推荐…", fontSize = 12.sp, color = ZhijingColors.Muted)
                            } else {
                                Text("探索当地 · 真实信息", fontSize = 12.sp, color = ZhijingColors.Muted)
                            }
                        }
                    }
                    FloatingIconButton("🔍") { onOpenGenerate(city, null, null) }
                }

                // 分类筛选
                Row(
                    Modifier
                        .align(Alignment.TopStart)
                        .padding(top = 72.dp, start = 12.dp, end = 12.dp)
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CITY_EXPLORE_CATEGORIES.forEach { cat ->
                        val count = if (cat.key == "foods") foods.size else spots.size
                        val on = categoryKey == cat.key
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(if (on) ZhijingColors.Brand else Color.White.copy(alpha = 0.94f))
                                .border(1.dp, if (on) ZhijingColors.Brand else ZhijingColors.Line, RoundedCornerShape(20.dp))
                                .clickable(enabled = count > 0) { categoryKey = cat.key }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(cat.icon, fontSize = 13.sp)
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    cat.label,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (on) Color.White else ZhijingColors.Ink,
                                )
                            }
                        }
                    }
                }

                // 定位按钮
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 124.dp, end = 12.dp)
                        .size(42.dp)
                        .shadow(4.dp, CircleShape)
                        .clip(CircleShape)
                        .background(Color.White)
                        .clickable(enabled = !locating) {
                            locating = true
                            scope.launch {
                                runCatching {
                                    LocationPrefs.save("granted")
                                    val loc = fetchDeviceLocation(context, highAccuracy = true)
                                    if (loc != null) {
                                        LocationCache.remember(loc, LocationCache.city)
                                        userLocation = loc
                                        focusSeq++
                                    }
                                }
                                locating = false
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (locating) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ZhijingColors.Brand)
                    } else {
                        LocateIcon()
                    }
                }

                DraggableBottomSheet(
                    modifier = Modifier.fillMaxSize(),
                    initialFraction = 0.52f,
                    onFractionChange = { sheetFraction = it },
                    footer = {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color(0xFFFFF0F0))
                                    .clickable {
                                        openXiaohongshuSearch(context, xhsCategoryKeyword(city, categoryKey))
                                    }
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("📕", fontSize = 16.sp)
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    "去小红书看$city${category.label}真实评价",
                                    Modifier.weight(1f),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = ZhijingColors.Ink,
                                )
                                Text("›", color = ZhijingColors.Muted)
                            }
                            Spacer(Modifier.height(8.dp))
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(ZhijingColors.Brand)
                                    .clickable { onOpenGenerate(city, null, null) }
                                    .padding(vertical = 14.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("为 $city 生成旅行攻略 ›", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }
                    },
                ) {
                    Column(
                        Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                    ) {
                        Text(city, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                        Spacer(Modifier.height(6.dp))
                        Text(intro, fontSize = 13.sp, color = ZhijingColors.Muted, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(10.dp))
                        Column(
                            Modifier
                                .weight(1f)
                                .verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            activeItems.forEach { item ->
                                CityPoiListRow(
                                    city = city,
                                    item = item,
                                    categoryKey = categoryKey,
                                    onClick = { selected = item },
                                )
                            }
                        }
                    }
                }

                selected?.let { spot ->
                    PoiDetailSheet(
                        item = spot,
                        category = categoryKey,
                        city = city,
                        onClose = { selected = null },
                        onAdd = {
                            onOpenGenerate(
                                city,
                                listOf(spot.name),
                                "请把「${spot.name}」加入${city}的行程规划",
                            )
                        },
                        onFeedback = onOpenChat,
                    )
                }
            }
        }
    }
}

@Composable
private fun CityPoiListRow(
    city: String,
    item: CitySpotDto,
    categoryKey: String,
    onClick: () -> Unit,
) {
    val imageUrl = rememberPlaceImage(city, item.name, categoryKey)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.BgSurface)
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(ZhijingColors.Line),
            contentAlignment = Alignment.Center,
        ) {
            if (imageUrl != null) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = item.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(if (categoryKey == "foods") "🍴" else "🌳", fontSize = 22.sp)
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(item.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(fakePopularity(item.name), fontSize = 12.sp, color = ZhijingColors.Muted)
        }
        Box(
            Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(ZhijingColors.BrandSoft)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Text("+", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.BrandHot)
        }
    }
}

@Composable
private fun CityDetailOverlay(city: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(ZhijingColors.Bg),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FloatingIconButton("‹", onBack)
            Text(city, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp))
        }
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            content()
        }
    }
}

@Composable
private fun CityInfoLoadingPane(city: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("🗺", fontSize = 40.sp)
        Spacer(Modifier.height(12.dp))
        CircularProgressIndicator(color = ZhijingColors.BrandHot)
        Spacer(Modifier.height(12.dp))
        Text("正在搜索 $city 的景点与美食…", fontSize = 14.sp, color = ZhijingColors.Muted)
    }
}

@Composable
private fun RetryButton(label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(ZhijingColors.Brand)
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 10.dp),
    ) {
        Text(label, color = Color.White, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FloatingIconButton(label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .shadow(4.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.96f))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(label, fontSize = if (label == "‹") 20.sp else 16.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun LocateIcon(size: androidx.compose.ui.unit.Dp = 18.dp, color: Color = Color(0xFF1A66FF)) {
    val stroke = 2.dp
    val tick = 3.dp
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Box(Modifier.size(size * 0.68f).border(stroke, color, CircleShape))
        Box(Modifier.size(size * 0.24f).clip(CircleShape).background(color))
        Box(Modifier.align(Alignment.TopCenter).size(width = stroke, height = tick).background(color))
        Box(Modifier.align(Alignment.BottomCenter).size(width = stroke, height = tick).background(color))
        Box(Modifier.align(Alignment.CenterStart).size(width = tick, height = stroke).background(color))
        Box(Modifier.align(Alignment.CenterEnd).size(width = tick, height = stroke).background(color))
    }
}
