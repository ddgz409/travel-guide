package com.travelguide.app.ui.screens.trip

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.resolveImageUrl
import com.travelguide.app.data.model.CITY_CATALOG
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.model.Location
import com.travelguide.app.data.model.PoiSearchResult
import com.travelguide.app.data.model.Trip
import com.travelguide.app.data.model.matchCities
import com.travelguide.app.data.util.resolvePoiSearchCity
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.rememberCoroutineScope

private val ADD_TYPES = listOf("attraction" to "景点", "meal" to "餐饮", "hotel" to "住宿")

// ---------- 添加地点 ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddSpotSheet(
    dayCity: String?,
    tripDestination: String,
    dayLabel: String,
    busy: Boolean,
    anchor: Location?,
    pickedLocation: Location? = null,
    onSelectPoi: (PoiSearchResult, String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val searchCity = remember(dayCity, tripDestination) {
        resolvePoiSearchCity(dayCity, tripDestination)
    }
    var query by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("attraction") }
    var results by remember { mutableStateOf<List<PoiSearchResult>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var customName by remember { mutableStateOf("") }
    var customBusy by remember { mutableStateOf(false) }

    val poiKind = when (type) {
        "meal" -> "foods"
        "hotel" -> "hotels"
        else -> "spots"
    }

    fun validateAndAddCustom(name: String) {
        if (name.isBlank() || busy || customBusy) return
        customBusy = true
        scope.launch {
            try {
                val list = ApiClient.trips.searchPois(
                    q = name,
                    city = searchCity.ifBlank { name },
                    limit = 5,
                    lng = anchor?.lng,
                    lat = anchor?.lat,
                )
                when {
                    list.isEmpty() -> {
                        val hint = searchCity.ifBlank { "当前城市" }
                        Toast.makeText(
                            context,
                            "未在「$hint」找到「$name」，请从下方搜索结果选择",
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                    list.size == 1 || list.any { it.name.trim() == name.trim() } -> {
                        val pick = list.firstOrNull { it.name.trim() == name.trim() } ?: list.first()
                        if (pick.location == null) {
                            Toast.makeText(context, "该地点缺少坐标，请换关键词搜索", Toast.LENGTH_SHORT).show()
                        } else {
                            onSelectPoi(pick, type)
                        }
                    }
                    else -> {
                        results = list
                        query = name
                        Toast.makeText(context, "找到多个相似地点，请选择正确的一项", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (_: Exception) {
                Toast.makeText(context, "地点校验失败，请稍后重试", Toast.LENGTH_SHORT).show()
            } finally {
                customBusy = false
            }
        }
    }

    // 搜索防抖（400ms）
    LaunchedEffect(query, type, searchCity, anchor?.lng, anchor?.lat) {
        results = emptyList()
        if (query.isBlank()) {
            searching = false
            return@LaunchedEffect
        }
        searching = true
        delay(400)
        try {
            results = ApiClient.trips.searchPois(
                q = query.trim(),
                city = searchCity.ifBlank { query.trim() },
                limit = 8,
                lng = anchor?.lng,
                lat = anchor?.lat,
            )
        } catch (_: Exception) {
            results = emptyList()
        } finally {
            searching = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = ZhijingColors.Card,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
            Text("添加地点 · $dayLabel", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            if (pickedLocation != null) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "已选地图坐标 · ${"%.5f".format(pickedLocation.lat)}, ${"%.5f".format(pickedLocation.lng)}",
                    fontSize = 12.sp,
                    color = ZhijingColors.BrandHot,
                )
            }
            if (searchCity.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "搜索范围：$searchCity（环线行程按当天城市定位）",
                    fontSize = 11.sp,
                    color = ZhijingColors.Muted,
                )
            }
            Spacer(Modifier.height(12.dp))

            // 类型选择
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ADD_TYPES.forEach { (t, label) ->
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (type == t) ZhijingColors.BrandHot else ZhijingColors.BgSurface)
                            .clickable { type = t }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(label, fontSize = 13.sp, color = if (type == t) Color.White else ZhijingColors.Ink)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            // 自定义地点（直接加）
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = customName,
                    onValueChange = { customName = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("没有想要的？输入自定义地点名", fontSize = 13.sp) },
                    singleLine = true,
                    colors = fieldColors(),
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = { validateAndAddCustom(customName.trim()) },
                    enabled = customName.isNotBlank() && !busy && !customBusy,
                    colors = ButtonDefaults.buttonColors(containerColor = ZhijingColors.BrandHot),
                ) {
                    Text(if (customBusy) "校验中…" else "添加")
                }
            }
            Spacer(Modifier.height(12.dp))

            // POI 搜索
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(
                    if (searchCity.isNotBlank()) "在 $searchCity 搜索${TYPE_LABEL[type] ?: ""}…"
                    else "输入关键字搜索${TYPE_LABEL[type] ?: "地点"}…",
                    fontSize = 13.sp,
                ) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                colors = fieldColors(),
            )
            Spacer(Modifier.height(10.dp))

            if (searching) {
                Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.height(20.dp).width(20.dp), strokeWidth = 2.dp, color = ZhijingColors.BrandHot)
                }
            } else {
                LazyColumn(Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
                    items(results, key = { it.poiId.ifEmpty { it.name } }) { poi ->
                        val coverUrl = rememberPlaceImage(
                            city = searchCity.ifBlank { tripDestination },
                            name = poi.name,
                            kind = poiKind,
                            poiId = poi.poiId,
                        )
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(ZhijingColors.BgSurface)
                                .clickable(enabled = !busy && poi.location != null) {
                                    if (poi.location != null) onSelectPoi(poi, type)
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(ZhijingColors.Line),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (coverUrl != null) {
                                    AsyncImage(
                                        model = coverUrl,
                                        contentDescription = poi.name,
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop,
                                    )
                                } else {
                                    Text("📍", fontSize = 18.sp)
                                }
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(poi.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                val addr = poi.address.ifBlank { poi.location?.address.orEmpty() }
                                if (addr.isNotBlank()) {
                                    Text(addr, fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            poi.rating?.let {
                                Text(String.format("%.1f", it), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.BrandHot)
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

// ---------- 城市管理 ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCitySheet(
    trip: Trip,
    busy: Boolean,
    onAddCity: (String, Int) -> Unit,
    onDeleteCity: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var city by remember { mutableStateOf("") }
    var position by remember { mutableStateOf((trip.days.size) + 1) }
    val cities = remember(trip) {
        (trip.route?.takeIf { it.isNotEmpty() } ?: trip.days.mapNotNull { it.city }).distinct()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = ZhijingColors.Card,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
            Text("管理城市", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(12.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = city,
                    onValueChange = { city = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("输入城市名，如：上海", fontSize = 13.sp) },
                    singleLine = true,
                    colors = fieldColors(),
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = { if (city.isNotBlank() && !busy) onAddCity(city.trim(), position) },
                    enabled = city.isNotBlank() && !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = ZhijingColors.BrandHot),
                ) {
                    Text(if (busy) "…" else "添加")
                }
            }
            Spacer(Modifier.height(10.dp))

            // 输入联想：前缀优先；无匹配时提醒检查城市名（后端仍会做最终校验）
            val query = city.trim()
            val suggestions = remember(query) { matchCities(query) }
            if (query.isEmpty()) {
                Text("热门城市", fontSize = 12.sp, color = ZhijingColors.Muted)
                Spacer(Modifier.height(6.dp))
                CityChipRow(CITY_CATALOG.take(12)) { city = it }
            } else if (suggestions.isNotEmpty()) {
                Text("你是不是想找", fontSize = 12.sp, color = ZhijingColors.Muted)
                Spacer(Modifier.height(6.dp))
                CityChipRow(suggestions) { city = it }
            } else {
                Text(
                    "未在列表中找到「$query」，仍可直接添加（将校验地名）",
                    fontSize = 12.sp,
                    color = ZhijingColors.Muted,
                )
            }
            Spacer(Modifier.height(10.dp))

            // 插入位置
            Text("插入位置", fontSize = 12.sp, color = ZhijingColors.Muted)
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (p in 1..(trip.days.size + 1)) {
                    val on = p == position
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (on) ZhijingColors.BrandHot else ZhijingColors.BgSurface)
                            .clickable { position = p }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Text("第 $p 天起", fontSize = 12.sp, color = if (on) Color.White else ZhijingColors.Ink)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))

            // 现有城市（可删）
            if (cities.isNotEmpty()) {
                Text("当前路线", fontSize = 12.sp, color = ZhijingColors.Muted)
                Spacer(Modifier.height(6.dp))
                cities.forEach { c ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(ZhijingColors.BgSurface)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(c, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        Text(
                            "删除",
                            fontSize = 13.sp,
                            color = ZhijingColors.Danger,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable(enabled = !busy) { onDeleteCity(c) }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun CityChipRow(cities: List<String>, onPick: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        cities.forEach { c ->
            Box(
                Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(ZhijingColors.BgSurface)
                    .clickable { onPick(c) }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(c, fontSize = 12.sp, color = ZhijingColors.Ink)
            }
        }
    }
}

// ---------- 表单颜色 ----------

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = ZhijingColors.BrandHot,
    unfocusedBorderColor = ZhijingColors.Line,
    focusedContainerColor = ZhijingColors.Bg,
    unfocusedContainerColor = ZhijingColors.Bg,
)
