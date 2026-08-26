package com.travelguide.app.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.delay

private val ADD_TYPES = listOf("attraction" to "景点", "meal" to "餐饮", "hotel" to "住宿")

// ---------- 添加地点 ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddSpotSheet(
    city: String,
    dayLabel: String,
    busy: Boolean,
    /** 当天行程锚点坐标：传给后端逆地理定位城市，
     *  避免多城路线名（如「青甘环线」）当 city 导致搜不到 */
    anchor: Location?,
    onSelectPoi: (PoiSearchResult, String) -> Unit,
    onAddCustom: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("attraction") }
    var results by remember { mutableStateOf<List<PoiSearchResult>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var customName by remember { mutableStateOf("") }

    // 搜索防抖（400ms）
    LaunchedEffect(query, type) {
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
                // 无坐标时用关键字兜底当城市（对齐 RN 版），避免空 city 零结果
                city = city.trim().ifBlank { query.trim() },
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
                    onClick = {
                        if (customName.isNotBlank() && !busy) onAddCustom(customName.trim(), type)
                    },
                    enabled = customName.isNotBlank() && !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = ZhijingColors.BrandHot),
                ) {
                    Text("添加")
                }
            }
            Spacer(Modifier.height(12.dp))

            // POI 搜索
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("在 $city 搜索${TYPE_LABEL[type] ?: ""}…", fontSize = 13.sp) },
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
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(ZhijingColors.BgSurface)
                                .clickable(enabled = !busy) { onSelectPoi(poi, type) }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(poi.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (poi.address.isNotBlank()) {
                                    Text(poi.address, fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                    "未匹配到「$query」相关城市，请检查城市名称",
                    fontSize = 12.sp,
                    color = ZhijingColors.Danger,
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

// ---------- 地点详情（v1 精简版） ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemDetailSheet(
    item: Item,
    city: String,
    onToggleSelected: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val badge = typeBadge(item.type)
    // 真实图片画廊（对齐 RN TripItemDetailScreen 的 PlaceImage 行）
    var gallery by remember(item.id, city) { mutableStateOf<List<String>?>(null) }
    LaunchedEffect(item.id, city) {
        if (city.isBlank()) return@LaunchedEffect
        val kind = when (item.type) {
            "meal" -> "foods"
            "attraction" -> "spots"
            else -> ""
        }
        gallery = runCatching {
            ApiClient.destinations.placeImages(
                city = city,
                name = item.name,
                kind = kind,
                limit = 3,
                poiId = item.poiId.orEmpty(),
            ).images
        }.getOrDefault(emptyList()).map { resolveImageUrl(it) }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = ZhijingColors.Card,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    item.name,
                    style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Box(Modifier.clip(RoundedCornerShape(6.dp)).background(badge.bg).padding(horizontal = 8.dp, vertical = 3.dp)) {
                    Text(TYPE_LABEL[item.type] ?: item.type, fontSize = 12.sp, color = badge.fg)
                }
            }
            Spacer(Modifier.height(12.dp))

            // 图片画廊
            val imgs = gallery.orEmpty()
            if (imgs.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    imgs.forEach { url ->
                        AsyncImage(
                            model = url,
                            contentDescription = item.name,
                            modifier = Modifier
                                .size(width = 140.dp, height = 96.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(ZhijingColors.BgSurface),
                            contentScale = ContentScale.Crop,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            Text(
                buildList {
                    add(SLOT_LABEL[item.timeSlot] ?: item.timeSlot.ifBlank { null })
                    item.durationMin?.let { add("${it}分钟") }
                    item.cost?.let { add("¥${it.toLong()}") }
                    item.rating?.let { add("评分 $it") }
                }.filterNotNull().joinToString(" · "),
                fontSize = 13.sp,
                color = ZhijingColors.Muted,
            )

            item.location?.address?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(6.dp))
                Text("📍 $it", fontSize = 13.sp, color = ZhijingColors.Muted)
            }

            item.description?.trim()?.takeIf { it.isNotEmpty() }?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, fontSize = 14.sp, lineHeight = 22.sp)
            }

            Spacer(Modifier.height(16.dp))
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(if (item.selected) "已加入精选行程" else "已从精选中隐藏", fontSize = 14.sp)
                Spacer(Modifier.weight(1f))
                Switch(
                    checked = item.selected,
                    onCheckedChange = onToggleSelected,
                    colors = SwitchDefaults.colors(checkedTrackColor = ZhijingColors.BrandHot),
                )
            }
            Spacer(Modifier.height(28.dp))
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = ZhijingColors.BrandHot,
    unfocusedBorderColor = ZhijingColors.Line,
    focusedContainerColor = ZhijingColors.Bg,
    unfocusedContainerColor = ZhijingColors.Bg,
)
