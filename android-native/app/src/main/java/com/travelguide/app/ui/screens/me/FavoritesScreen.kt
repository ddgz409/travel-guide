package com.travelguide.app.ui.screens.me

import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.CheckInStore
import com.travelguide.app.data.local.DEFAULT_FOLDER_ID
import com.travelguide.app.data.local.FavoriteFolder
import com.travelguide.app.data.local.FavoritePlace
import com.travelguide.app.data.local.FavoritePlaceInput
import com.travelguide.app.data.local.FavoriteStore
import com.travelguide.app.data.local.resolvePrefectureFromText
import com.travelguide.app.data.model.PoiSearchResult
import com.travelguide.app.data.model.ProvinceMapData
import com.travelguide.app.data.util.CheckInMapHtmlOptions
import com.travelguide.app.data.util.buildCheckInMapHtml
import com.travelguide.app.data.util.fetchDeviceLocation
import com.travelguide.app.ui.components.CheckInMapWebView
import com.travelguide.app.ui.components.DraggableBottomSheet
import com.travelguide.app.ui.components.FavoritesAddButton
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun cityOfPoi(poi: PoiSearchResult, fallback: String): String {
    val blob = "${poi.address} ${poi.location?.address.orEmpty()} ${poi.name}"
    return resolvePrefectureFromText(blob)?.second ?: fallback
}

/**
 * 我的收藏（对齐 RN FavoritesScreen）：
 * - 打卡地图背景 + 可拖拽抽屉
 * - 收藏夹列表 / 夹内地点 / 全屏搜索添加
 */
@Composable
fun FavoritesScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var folders by remember { mutableStateOf(emptyList<FavoriteFolder>()) }
    var places by remember { mutableStateOf(emptyList<FavoritePlace>()) }
    var openFolderId by remember { mutableStateOf<String?>(null) }
    var createOpen by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var searchOpen by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf(emptyList<PoiSearchResult>()) }
    var locCity by remember { mutableStateOf("") }
    var removeTarget by remember { mutableStateOf<FavoritePlace?>(null) }
    var checkedIds by remember { mutableStateOf(emptyList<String>()) }

    LaunchedEffect(Unit) {
        checkedIds = withContext(Dispatchers.IO) { CheckInStore.checkedPrefectureIds() }
    }

    val mapHtml = remember(checkedIds) {
        buildCheckInMapHtml(
            checkedIds,
            ProvinceMapData.getProvinces(context),
            options = CheckInMapHtmlOptions(highlightChecked = true, interactive = true),
        )
    }

    fun reload() {
        scope.launch {
            folders = FavoriteStore.listFolders()
            places = FavoriteStore.listPlaces()
            checkedIds = CheckInStore.checkedPrefectureIds()
        }
    }

    LaunchedEffect(Unit) { reload() }
    DisposableEffect(Unit) {
        val unsub = FavoriteStore.subscribe { reload() }
        onDispose { unsub() }
    }

    val openFolder = folders.find { it.id == openFolderId }
    val visiblePlaces = if (openFolderId != null) {
        places.filter { it.folderId == openFolderId }
    } else {
        emptyList()
    }
    val targetFolderId = openFolderId ?: DEFAULT_FOLDER_ID

    LaunchedEffect(searchOpen) {
        if (!searchOpen) return@LaunchedEffect
        val pos = fetchDeviceLocation(context) ?: return@LaunchedEffect
        if (locCity.isBlank()) {
            locCity = runCatching {
                ApiClient.destinations.regeo(pos.lng, pos.lat).city.replace("市", "")
            }.getOrDefault("")
        }
    }

    LaunchedEffect(query, searchOpen) {
        if (!searchOpen) return@LaunchedEffect
        val kw = query.trim()
        if (kw.isEmpty()) {
            results = emptyList()
            searching = false
            return@LaunchedEffect
        }
        delay(280)
        searching = true
        val pos = fetchDeviceLocation(context)
        if (pos == null) {
            searching = false
            Toast.makeText(context, "需要定位权限才能搜索附近地点", Toast.LENGTH_SHORT).show()
            return@LaunchedEffect
        }
        if (locCity.isBlank()) {
            locCity = runCatching {
                ApiClient.destinations.regeo(pos.lng, pos.lat).city.replace("市", "")
            }.getOrDefault("")
        }
        results = runCatching {
            ApiClient.trips.searchPois(
                q = kw,
                city = locCity.ifBlank { "北京" },
                limit = 15,
                lng = pos.lng,
                lat = pos.lat,
            )
        }.getOrElse {
            Toast.makeText(context, "搜索失败：${it.message}", Toast.LENGTH_SHORT).show()
            emptyList()
        }
        searching = false
    }

    fun addPoi(poi: PoiSearchResult) {
        val loc = poi.location
        if (loc == null) {
            Toast.makeText(context, "该地点没有坐标，换一个试试", Toast.LENGTH_SHORT).show()
            return
        }
        scope.launch {
            FavoriteStore.addPlace(
                targetFolderId,
                FavoritePlaceInput(
                    name = poi.name,
                    city = cityOfPoi(poi, locCity.ifBlank { "未知" }),
                    address = poi.address.ifBlank { loc.address.orEmpty() },
                    lng = loc.lng,
                    lat = loc.lat,
                    poiId = poi.poiId.ifBlank { null },
                ),
            )
            openFolderId = targetFolderId
            searchOpen = false
            query = ""
            results = emptyList()
            Toast.makeText(context, "已加入收藏", Toast.LENGTH_SHORT).show()
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0xFFEFE8F8))) {
        CheckInMapWebView(
            html = mapHtml,
            interactive = true,
            modifier = Modifier.fillMaxSize(),
        )

        Box(
            Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(start = 14.dp, top = 4.dp)
                .size(40.dp)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(Color(0xF0FFFFFF))
                .clickable {
                    when {
                        searchOpen -> {
                            searchOpen = false
                            query = ""
                            results = emptyList()
                        }
                        openFolderId != null -> openFolderId = null
                        else -> onBack()
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Text("‹", fontSize = 22.sp, color = ZhijingColors.Ink, fontWeight = FontWeight.Light)
        }

        DraggableBottomSheet(
            footer = {
                FavoritesAddButton(
                    label = if (openFolderId != null) "添加地点" else "新建收藏夹",
                    onClick = {
                        if (openFolderId != null) searchOpen = true
                        else {
                            newName = ""
                            createOpen = true
                        }
                    },
                )
            },
        ) {
            Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
                if (openFolder != null) {
                    FolderDetailContent(
                        folder = openFolder,
                        places = visiblePlaces,
                        onRemove = { removeTarget = it },
                        onSearch = { searchOpen = true },
                    )
                } else {
                    FolderListContent(
                        folders = folders,
                        places = places,
                        onOpen = { openFolderId = it },
                    )
                }
            }
        }

        if (searchOpen) {
            FavoriteSearchOverlay(
                query = query,
                onQuery = { query = it },
                locCity = locCity,
                searching = searching,
                results = results,
                onClose = {
                    searchOpen = false
                    query = ""
                    results = emptyList()
                },
                onPick = ::addPoi,
            )
        }
    }

    if (createOpen) {
        AlertDialog(
            onDismissRequest = { createOpen = false },
            title = { Text("新建收藏夹", fontWeight = FontWeight.ExtraBold) },
            text = {
                TextField(
                    value = newName,
                    onValueChange = { newName = it },
                    placeholder = { Text("收藏夹名称") },
                    singleLine = true,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = ZhijingColors.BgSurface,
                        unfocusedContainerColor = ZhijingColors.BgSurface,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        val folder = FavoriteStore.createFolder(newName)
                        newName = ""
                        createOpen = false
                        openFolderId = folder.id
                        searchOpen = true
                    }
                }) { Text("创建并搜地点", fontWeight = FontWeight.ExtraBold, color = ZhijingColors.BrandHot) }
            },
            dismissButton = {
                TextButton(onClick = { createOpen = false }) { Text("取消") }
            },
        )
    }

    removeTarget?.let { p ->
        AlertDialog(
            onDismissRequest = { removeTarget = null },
            title = { Text("移除收藏") },
            text = { Text("从收藏夹去掉「${p.name}」？") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        FavoriteStore.removePlace(p.id)
                        removeTarget = null
                    }
                }) { Text("移除", color = ZhijingColors.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { removeTarget = null }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun FolderListContent(
    folders: List<FavoriteFolder>,
    places: List<FavoritePlace>,
    onOpen: (String) -> Unit,
) {
    Text("我的收藏", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
    Text(
        "收藏夹 · ${folders.size}    地点 · ${places.size}",
        fontSize = 13.sp,
        color = ZhijingColors.Muted,
        modifier = Modifier.padding(top = 6.dp),
    )
    LazyColumn(
        Modifier.fillMaxSize().padding(top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        items(folders, key = { it.id }) { f ->
            val count = places.count { it.folderId == f.id }
            val cover = places.find { it.folderId == f.id }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 18.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Color(0xFFF7F8FA))
                    .clickable { onOpen(f.id) }
                    .padding(18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(f.name, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                    Text(
                        "${if (f.locked) "🔒  " else ""}$count 地点",
                        fontSize = 13.sp,
                        color = ZhijingColors.Muted,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                if (cover != null) {
                    val img = rememberPlaceImage(cover.city, cover.name, "", cover.poiId.orEmpty())
                    AsyncImage(
                        model = img,
                        contentDescription = null,
                        modifier = Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)),
                    )
                } else {
                    Text("📁", fontSize = 42.sp)
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FolderDetailContent(
    folder: FavoriteFolder,
    places: List<FavoritePlace>,
    onRemove: (FavoritePlace) -> Unit,
    onSearch: () -> Unit,
) {
    Text(folder.name, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
    Text("${places.size} 地点", fontSize = 13.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(top = 6.dp))
    Box(
        Modifier
            .fillMaxWidth()
            .padding(top = 16.dp)
            .height(44.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(ZhijingColors.BgSurface)
            .clickable(onClick = onSearch)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text("搜索地点，添加到收藏夹", fontSize = 15.sp, color = ZhijingColors.Muted)
    }
    if (places.isEmpty()) {
        Text(
            "还没有地点，搜索一个加上吧",
            fontSize = 14.sp,
            color = ZhijingColors.Muted,
            modifier = Modifier.fillMaxWidth().padding(top = 28.dp),
        )
    } else {
        LazyColumn(Modifier.fillMaxSize().padding(top = 8.dp)) {
            items(places, key = { it.id }) { p ->
                PlaceRow(place = p, onLongPressRemove = { onRemove(p) })
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlaceRow(place: FavoritePlace, onLongPressRemove: () -> Unit) {
    val img = rememberPlaceImage(place.city, place.name, "", place.poiId.orEmpty())
    Row(
        Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = {}, onLongClick = onLongPressRemove)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = img,
            contentDescription = null,
            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(place.name, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(place.city, place.address).filter { it.isNotBlank() }.joinToString(" · "),
                fontSize = 12.sp,
                color = ZhijingColors.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(ZhijingColors.Line))
}

@Composable
private fun FavoriteSearchOverlay(
    query: String,
    onQuery: (String) -> Unit,
    locCity: String,
    searching: Boolean,
    results: List<PoiSearchResult>,
    onClose: () -> Unit,
    onPick: (PoiSearchResult) -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Color.White)
            .statusBarsPadding(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "‹",
                fontSize = 28.sp,
                color = ZhijingColors.Ink,
                modifier = Modifier
                    .width(28.dp)
                    .clickable(onClick = onClose),
            )
            TextField(
                value = query,
                onValueChange = onQuery,
                placeholder = {
                    Text(
                        if (locCity.isNotBlank()) "搜索${locCity}附近地点" else "搜索地点",
                        color = ZhijingColors.Muted,
                    )
                },
                singleLine = true,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 8.dp)
                    .clip(RoundedCornerShape(18.dp)),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = ZhijingColors.BgSurface,
                    unfocusedContainerColor = ZhijingColors.BgSurface,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )
        }
        when {
            searching -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.Brand)
            }
            query.isBlank() -> Text(
                "输入关键词，搜索要收藏的地点",
                fontSize = 14.sp,
                color = ZhijingColors.Muted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
            )
            results.isEmpty() -> Text(
                "没有找到相关地点",
                fontSize = 14.sp,
                color = ZhijingColors.Muted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
            )
            else -> LazyColumn {
                items(results, key = { "${it.poiId}-${it.name}-${it.location?.lng}" }) { poi ->
                    val cityHint = cityOfPoi(poi, locCity.ifBlank { "未知" })
                    val img = rememberPlaceImage(cityHint, poi.name, "", poi.poiId)
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onPick(poi) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AsyncImage(
                            model = img,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)),
                        )
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(poi.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                poi.address.ifBlank { poi.location?.address.orEmpty() },
                                fontSize = 12.sp,
                                color = ZhijingColors.Muted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(ZhijingColors.Line))
                }
            }
        }
    }
}
