package com.travelguide.app.ui.screens.me

import android.os.Bundle
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.travelguide.app.ui.components.rememberAmapMapView
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.MarkerOptions
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.local.AddCheckInInput
import com.travelguide.app.data.local.CheckInStore
import com.travelguide.app.data.local.FootprintHistoryItem
import com.travelguide.app.data.local.resolvePrefectureFromText
import com.travelguide.app.data.model.PoiSearchResult
import com.travelguide.app.data.util.DeviceLocation
import com.travelguide.app.data.util.LocationCache
import com.travelguide.app.data.util.fetchDeviceLocation
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** 添加足迹（对齐 RN AddFootprintScreen）：地图 + 搜索面板 + 打卡气泡 */

private data class Picked(
    val name: String,
    val address: String,
    val city: String,
    val lng: Double,
    val lat: Double,
    val type: String,
)

/** 地图指令：打点并移动相机（null name = 仅居中，不打点） */
private data class MapCmd(val lng: Double, val lat: Double, val name: String?, val seq: Int)

private val CHIPS = listOf("美食" to "🍴", "酒店" to "🏨", "景点" to "🏛", "加油站" to "⛽")

private fun categoryFromType(type: String) =
    if (Regex("餐|美食|食品|饮|咖啡|茶|小吃").containsMatchIn(type)) "foods" else "spots"

private data class Notice(val title: String, val msg: String, val finish: Boolean = false)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AddFootprintScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current

    var q by remember { mutableStateOf("") }
    var searchOpen by remember { mutableStateOf(false) }
    var searching by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf(emptyList<PoiSearchResult>()) }
    var history by remember { mutableStateOf(emptyList<FootprintHistoryItem>()) }
    var picked by remember { mutableStateOf<Picked?>(null) }
    var busy by remember { mutableStateOf(false) }
    var locating by remember { mutableStateOf(false) }
    var locCity by remember { mutableStateOf(LocationCache.cityStripped() ?: "") }
    var userLoc by remember { mutableStateOf<DeviceLocation?>(LocationCache.location) }
    var notice by remember { mutableStateOf<Notice?>(null) }
    var cmd by remember { mutableStateOf<MapCmd?>(null) }
    var cmdSeq by remember { mutableStateOf(0) }
    var searchJob by remember { mutableStateOf<Job?>(null) }

    val mapView = rememberAmapMapView()

    LaunchedEffect(Unit) {
        history = CheckInStore.historyList()
    }

    fun sendCmd(lng: Double, lat: Double, name: String?) {
        cmdSeq += 1
        cmd = MapCmd(lng, lat, name, cmdSeq)
    }

    // 静默定位（对齐 RN locate(false)：先吃缓存，再后台拿一次）
    LaunchedEffect(Unit) {
        LocationCache.location?.let { sendCmd(it.lng, it.lat, null) }
        val pos = fetchDeviceLocation(context)
        if (pos != null) {
            userLoc = pos
            val geo = runCatching { ApiClient.destinations.regeo(pos.lng, pos.lat) }.getOrNull()
            val city = geo?.city?.takeIf { it.isNotBlank() }
            if (city != null) locCity = city.removeSuffix("市")
            LocationCache.remember(pos, city)
            sendCmd(pos.lng, pos.lat, null)
        }
    }

    fun locateInteractive() {
        if (locating) return
        locating = true
        scope.launch {
            val pos = fetchDeviceLocation(context, fresh = true)
            if (pos != null) {
                userLoc = pos
                val geo = runCatching { ApiClient.destinations.regeo(pos.lng, pos.lat) }.getOrNull()
                val city = geo?.city?.takeIf { it.isNotBlank() }
                if (city != null) locCity = city.removeSuffix("市")
                LocationCache.remember(pos, city)
                sendCmd(pos.lng, pos.lat, null)
            } else {
                notice = Notice("定位失败", "未获取到位置，可在系统设置中打开定位权限后再试")
            }
            locating = false
        }
    }

    fun runSearch(keyword: String) {
        val kw = keyword.trim()
        if (kw.isEmpty()) {
            results = emptyList()
            return
        }
        searching = true
        scope.launch {
            try {
                var pos = userLoc ?: LocationCache.location
                if (pos == null) {
                    pos = fetchDeviceLocation(context)
                    pos?.let { userLoc = it }
                }
                if (pos != null) {
                    val geo = runCatching { ApiClient.destinations.regeo(pos.lng, pos.lat) }.getOrNull()
                    val city = geo?.city?.ifBlank { geo.province }?.removeSuffix("市")
                    if (!city.isNullOrBlank()) {
                        locCity = city
                        LocationCache.remember(pos, geo?.city ?: city)
                    }
                }
                if (pos == null) {
                    notice = Notice("需要定位", "请先点击地图「定位」，再搜索附近地点。")
                    return@launch
                }
                results = ApiClient.trips.searchPois(
                    q = kw,
                    city = locCity.ifBlank { kw },
                    limit = 15,
                    lng = pos.lng,
                    lat = pos.lat,
                )
            } catch (e: Exception) {
                notice = Notice("搜索失败", e.message ?: "请稍后重试")
            } finally {
                searching = false
            }
        }
    }

    fun onChangeQuery(text: String) {
        q = text
        searchOpen = true
        searchJob?.cancel()
        searchJob = scope.launch {
            delay(280)
            runSearch(text)
        }
    }

    fun showOnMap(next: Picked) {
        keyboard?.hide()
        searchOpen = false
        picked = next
        scope.launch {
            CheckInStore.historyPush(
                FootprintHistoryItem(next.name, next.address, next.city, next.lng, next.lat)
            )
            history = CheckInStore.historyList()
        }
        sendCmd(next.lng, next.lat, next.name)
    }

    fun cityOfPoi(poi: PoiSearchResult, fallback: String): String {
        val blob = "${poi.address} ${poi.location?.address.orEmpty()} ${poi.name}"
        return resolvePrefectureFromText(blob)?.second ?: fallback
    }

    fun pickPoi(poi: PoiSearchResult) {
        val loc = poi.location
        if (loc == null) {
            notice = Notice("无法定位", "该地点没有坐标，换一个试试")
            return
        }
        showOnMap(
            Picked(
                name = poi.name,
                address = poi.address.ifBlank { loc.address.orEmpty() },
                city = cityOfPoi(poi, locCity),
                lng = loc.lng,
                lat = loc.lat,
                type = poi.type,
            )
        )
    }

    fun pickHistory(item: FootprintHistoryItem) {
        if (item.lng != null && item.lat != null) {
            showOnMap(
                Picked(item.name, item.address.orEmpty(), item.city ?: locCity, item.lng, item.lat, "")
            )
            return
        }
        q = item.name
        searchOpen = true
        runSearch(item.name)
    }

    fun confirmCheckIn() {
        val p = picked ?: return
        if (busy) return
        busy = true
        scope.launch {
            try {
                val city = p.city.ifBlank { locCity }
                if (CheckInStore.isChecked(city, p.name)) {
                    notice = Notice("已打卡", "「${p.name}」已经在足迹里了")
                    return@launch
                }
                CheckInStore.add(
                    AddCheckInInput(city, p.name, categoryFromType(p.type), p.lng, p.lat, p.address)
                )
                notice = Notice("打卡成功", "已添加「${p.name}」", finish = true)
            } catch (e: Exception) {
                notice = Notice("打卡失败", e.message ?: "请稍后重试")
            } finally {
                busy = false
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0xFFEEF2F7))) {
        // ---------- 地图 ----------
        val lastApplied = remember { mutableStateOf<MapCmd?>(null) }
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                mapView.apply {
                    map?.let { a ->
                        a.uiSettings.apply {
                            isZoomControlsEnabled = false
                            isMyLocationButtonEnabled = false
                        }
                    }
                }
            },
            update = {
                val c = cmd
                it.map?.let { a ->
                    if (c != null && c != lastApplied.value) {
                        a.clear()
                        if (c.name != null) {
                            a.addMarker(MarkerOptions().position(LatLng(c.lat, c.lng)).title(c.name))
                        }
                        a.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(c.lat, c.lng), 16f))
                        lastApplied.value = c
                    }
                }
            },
        )

        // ---------- 顶栏 ----------
        Row(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .shadow(6.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color(0xF0FFFFFF))
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) {
                Text("‹", fontSize = 22.sp, fontWeight = FontWeight.Light, color = ZhijingColors.Ink)
            }
            Text(
                "添加足迹",
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                color = ZhijingColors.Ink,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(40.dp))
        }

        // ---------- 定位按钮 ----------
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(top = 62.dp, end = 12.dp),
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .shadow(6.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White)
                    .clickable(enabled = !locating) { locateInteractive() },
                contentAlignment = Alignment.Center,
            ) {
                if (locating) {
                    CircularProgressIndicator(Modifier.size(18.dp), color = ZhijingColors.BrandHot, strokeWidth = 2.dp)
                } else {
                    Icon(
                        Icons.Filled.MyLocation,
                        contentDescription = "定位",
                        tint = Color(0xFF1A66FF),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }

        // ---------- 已选地点气泡 ----------
        if (picked != null && !searchOpen) {
            val p = picked!!
            Row(
                Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, bottom = 92.dp)
                    .shadow(8.dp, RoundedCornerShape(22.dp))
                    .clip(RoundedCornerShape(22.dp))
                    .background(Color.White)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(p.name, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        listOf(p.city, p.address).filter { it.isNotBlank() }.joinToString(" · "),
                        fontSize = 12.sp,
                        color = ZhijingColors.Muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.width(10.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(18.dp))
                        .background(ZhijingColors.BrandHot)
                        .clickable(enabled = !busy) { confirmCheckIn() }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    if (busy) {
                        CircularProgressIndicator(Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Text("确定打卡", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                    }
                }
            }
        }

        // ---------- 底部搜索条（假输入框，点开全屏搜索） ----------
        if (!searchOpen) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .height(52.dp)
                    .shadow(8.dp, RoundedCornerShape(22.dp))
                    .clip(RoundedCornerShape(22.dp))
                    .background(Color.White)
                    .clickable { searchOpen = true }
                    .padding(start = 14.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("⌕", fontSize = 18.sp, color = ZhijingColors.Muted)
                Spacer(Modifier.width(8.dp))
                Text(
                    q.ifBlank { "搜索地点，添加到足迹" },
                    fontSize = 15.sp,
                    color = if (q.isBlank()) ZhijingColors.Muted else ZhijingColors.Ink,
                    fontWeight = if (q.isBlank()) FontWeight.Normal else FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(ZhijingColors.BrandHot)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text("搜索", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                }
            }
        }

        // ---------- 全屏搜索面板 ----------
        if (searchOpen) {
            val focusRequester = remember { FocusRequester() }
            Column(
                Modifier
                    .fillMaxSize()
                    .background(Color.White)
                    .statusBarsPadding(),
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "‹",
                        fontSize = 28.sp,
                        color = ZhijingColors.Ink,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.width(28.dp).clickable {
                            searchOpen = false
                            keyboard?.hide()
                        },
                    )
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier
                            .weight(1f)
                            .height(44.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(ZhijingColors.BgSurface)
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        BasicTextField(
                            value = q,
                            onValueChange = ::onChangeQuery,
                            singleLine = true,
                            textStyle = TextStyle(fontSize = 16.sp, color = ZhijingColors.Ink),
                            cursorBrush = SolidColor(ZhijingColors.BrandHot),
                            decorationBox = { inner ->
                                if (q.isEmpty()) {
                                    Text(
                                        if (locCity.isNotBlank()) "搜索${locCity}附近地点" else "搜索地点",
                                        fontSize = 16.sp,
                                        color = ZhijingColors.Muted,
                                    )
                                }
                                inner()
                            },
                            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(ZhijingColors.BrandHot)
                            .clickable { runSearch(q) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        Text("搜索", fontWeight = FontWeight.ExtraBold, color = Color.White)
                    }
                }
                LaunchedEffect(Unit) {
                    focusRequester.requestFocus()
                }

                FlowRow(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CHIPS.forEach { (text, icon) ->
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(18.dp))
                                .background(ZhijingColors.BgSurface)
                                .clickable {
                                    q = text
                                    runSearch(text)
                                }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Text("$icon $text", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
                        }
                    }
                }

                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = 40.dp),
                ) {
                    if (searching) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = ZhijingColors.BrandHot)
                            }
                        }
                    } else if (results.isNotEmpty()) {
                        items(results, key = { it.poiId.ifBlank { it.name } }) { poi ->
                            PoiRow(
                                pin = "📍",
                                title = poi.name,
                                sub = listOf(cityOfPoi(poi, locCity), poi.address).filter { it.isNotBlank() }.joinToString(" · "),
                            ) { pickPoi(poi) }
                        }
                    } else {
                        item {
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text("历史记录", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                                if (history.isNotEmpty()) {
                                    Text(
                                        "清空",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = ZhijingColors.Muted,
                                        modifier = Modifier.clickable {
                                            scope.launch {
                                                CheckInStore.historyClear()
                                                history = emptyList()
                                            }
                                        },
                                    )
                                }
                            }
                        }
                        if (history.isEmpty()) {
                            item {
                                Text(
                                    "搜一下想打卡的地点吧",
                                    fontSize = 14.sp,
                                    color = ZhijingColors.Muted,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    modifier = Modifier.fillMaxWidth().padding(top = 32.dp),
                                )
                            }
                        } else {
                            items(history) { h ->
                                PoiRow(
                                    pin = if (h.lng != null) "📍" else "⌕",
                                    title = h.name,
                                    sub = listOf(h.city.orEmpty(), h.address.orEmpty()).filter { it.isNotBlank() }.joinToString(" · "),
                                ) { pickHistory(h) }
                            }
                        }
                    }
                }
            }
        }

        // ---------- 提示弹窗 ----------
        notice?.let { n ->
            AlertDialog(
                onDismissRequest = { if (!busy) notice = null },
                title = { Text(n.title, fontWeight = FontWeight.Bold) },
                text = { Text(n.msg) },
                confirmButton = {
                    TextButton(onClick = {
                        notice = null
                        if (n.finish) onBack()
                    }) {
                        Text(if (n.finish) "完成" else "好的", color = ZhijingColors.BrandHot)
                    }
                },
            )
        }
    }
}

/** 搜索结果/历史记录行（对齐 RN row 样式） */
@Composable
private fun PoiRow(pin: String, title: String, sub: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(pin, fontSize = 16.sp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
            if (sub.isNotBlank()) {
                Spacer(Modifier.height(3.dp))
                Text(sub, fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
