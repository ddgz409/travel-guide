package com.travelguide.app.ui.screens.explore

import android.widget.Toast
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CollectionCreatePayload
import com.travelguide.app.data.api.CollectionPlace
import com.travelguide.app.data.local.CollectionPrefillStore
import com.travelguide.app.data.local.FavoriteStore
import com.travelguide.app.data.model.Trip
import com.travelguide.app.data.model.TripListItem
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

private val EMOJIS = listOf("📁", "📚", "🌲", "☕", "🍜", "🌊", "🏔️", "🌸", "🎨", "🗺️")

private val SLOT_LABELS = mapOf(
    "morning" to "上午",
    "afternoon" to "下午",
    "evening" to "晚上",
)

private fun placeKey(p: CollectionPlace) = "${p.city.orEmpty()}::${p.name}"

/** 从行程提取可分享地点（过滤交通与未选用） */
private fun placesFromTrip(trip: Trip): List<CollectionPlace> {
    val city = trip.destination.replace(Regex("市$"), "")
    val seen = mutableSetOf<String>()
    val out = mutableListOf<CollectionPlace>()
    for (day in trip.days) {
        for (item in day.items) {
            if (item.name.isBlank()) continue
            if (item.type == "transport") continue
            if (!item.selected) continue
            val key = "$city::${item.name}"
            if (!seen.add(key)) continue
            val slot = SLOT_LABELS[item.timeSlot.orEmpty()].orEmpty()
            out.add(
                CollectionPlace(
                    name = item.name,
                    city = city,
                    address = item.location?.address,
                    lng = item.location?.lng,
                    lat = item.location?.lat,
                    poiId = item.poiId,
                    note = "第${day.dayIndex}天${if (slot.isNotEmpty()) " $slot" else ""}",
                ),
            )
        }
    }
    return out
}

/**
 * 发布/编辑共享收藏夹（对齐 RN PublishCollectionScreen 核心：表单 + 收藏/行程导入；
 * 高德 POI 搜索与地图因配额暂缓，可手添地点）。
 */
@Composable
fun PublishCollectionScreen(
    collectionId: String? = null,
    tripId: String? = null,
    onBack: () -> Unit,
    onPublished: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var summary by remember { mutableStateOf("") }
    var emoji by remember { mutableStateOf("📁") }
    val places = remember { mutableStateListOf<CollectionPlace>() }
    var loading by remember { mutableStateOf(collectionId != null || tripId != null) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    var showAddPlace by remember { mutableStateOf(false) }
    var addName by remember { mutableStateOf("") }
    var addCity by remember { mutableStateOf("") }
    var addAddress by remember { mutableStateOf("") }

    var tripPicker by remember { mutableStateOf(false) }
    var tripList by remember { mutableStateOf(emptyList<TripListItem>()) }
    var loadingTrips by remember { mutableStateOf(false) }
    var importingTrip by remember { mutableStateOf(false) }
    var streamQueue by remember { mutableStateOf<List<CollectionPlace>?>(null) }
    var streamingLeft by remember { mutableStateOf(0) }

    fun mergePlaces(incoming: List<CollectionPlace>) {
        val seen = places.map { placeKey(it) }.toMutableSet()
        for (p in incoming) {
            val key = placeKey(p)
            if (seen.add(key)) places.add(p)
        }
    }

    LaunchedEffect(collectionId, tripId) {
        loading = true
        error = null
        streamQueue = null
        streamingLeft = 0
        if (collectionId != null) {
            runCatching { ApiClient.collections.detail(collectionId) }.fold(
                onSuccess = { d ->
                    if (!d.isOwner) {
                        error = "无权编辑"
                        Toast.makeText(context, "无权编辑", Toast.LENGTH_SHORT).show()
                        onBack()
                        return@fold
                    }
                    title = d.title
                    summary = d.summary.orEmpty()
                    emoji = d.emoji.ifBlank { "📁" }
                    places.clear()
                    places.addAll(d.places)
                },
                onFailure = { error = it.message ?: "加载失败" },
            )
            loading = false
            return@LaunchedEffect
        }
        CollectionPrefillStore.take()?.let { pre ->
            title = pre.title
            summary = pre.summary
            emoji = pre.emoji
            if (addCity.isBlank() && pre.destination.isNotBlank()) addCity = pre.destination
            val list = pre.places.take(50)
            if (list.isNotEmpty()) {
                streamQueue = list
                streamingLeft = list.size
            }
            loading = false
            return@LaunchedEffect
        }
        if (tripId != null) {
            runCatching { ApiClient.trips.get(tripId) }.fold(
                onSuccess = { trip ->
                    val extracted = placesFromTrip(trip).take(50)
                    if (extracted.isEmpty()) {
                        Toast.makeText(context, "该攻略没有可提取的地点", Toast.LENGTH_SHORT).show()
                        onBack()
                    } else {
                        title = trip.title.ifBlank { "${trip.destination}攻略" }
                        summary = "来自我的行程"
                        emoji = "🗺️"
                        streamQueue = extracted
                        streamingLeft = extracted.size
                    }
                },
                onFailure = {
                    error = it.message ?: "加载行程失败"
                    Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
                },
            )
            loading = false
            return@LaunchedEffect
        }
        loading = false
    }

    LaunchedEffect(streamQueue, streamingLeft) {
        val queue = streamQueue ?: return@LaunchedEffect
        if (streamingLeft <= 0) return@LaunchedEffect
        kotlinx.coroutines.delay(90)
        val idx = queue.size - streamingLeft
        queue.getOrNull(idx)?.let { p ->
            val seen = places.map { placeKey(it) }.toMutableSet()
            if (seen.add(placeKey(p))) places.add(p)
        }
        streamingLeft -= 1
    }

    fun importFavorites() {
        scope.launch {
            val favs = FavoriteStore.listPlaces()
            if (favs.isEmpty()) {
                Toast.makeText(context, "本地收藏夹还没有地点", Toast.LENGTH_SHORT).show()
                return@launch
            }
            val folders = FavoriteStore.listFolders().associateBy { it.id }
            mergePlaces(
                favs.map { f ->
                    CollectionPlace(
                        name = f.name,
                        city = f.city,
                        address = f.address,
                        lng = f.lng,
                        lat = f.lat,
                        poiId = f.poiId,
                        note = folders[f.folderId]?.name,
                    )
                },
            )
            Toast.makeText(context, "已从收藏导入 ${favs.size} 个地点", Toast.LENGTH_SHORT).show()
        }
    }

    fun openTripPicker() {
        tripPicker = true
        loadingTrips = true
        scope.launch {
            tripList = runCatching { ApiClient.trips.list() }.getOrDefault(emptyList())
            loadingTrips = false
        }
    }

    fun importFromTrip(id: String) {
        if (importingTrip) return
        importingTrip = true
        scope.launch {
            runCatching { ApiClient.trips.get(id) }.fold(
                onSuccess = { trip ->
                    val extracted = placesFromTrip(trip)
                    if (extracted.isEmpty()) {
                        Toast.makeText(context, "该攻略没有可提取的地点", Toast.LENGTH_SHORT).show()
                    } else {
                        val limited = extracted.take(50)
                        mergePlaces(limited)
                        if (title.isBlank()) title = trip.title
                        Toast.makeText(
                            context,
                            "已提取 ${extracted.size} 个地点${if (extracted.size > 50) "（保留前 50）" else ""}",
                            Toast.LENGTH_SHORT,
                        ).show()
                    }
                    tripPicker = false
                },
                onFailure = {
                    Toast.makeText(context, it.message ?: "提取失败", Toast.LENGTH_SHORT).show()
                },
            )
            importingTrip = false
        }
    }

    fun publish() {
        val t = title.trim()
        if (t.isEmpty()) {
            error = "请填写标题"
            return
        }
        if (places.isEmpty()) {
            error = "请至少添加 1 个地点"
            return
        }
        scope.launch {
            saving = true
            error = null
            val payload = CollectionCreatePayload(
                title = t,
                summary = summary.trim().ifBlank { null },
                emoji = emoji,
                city = places.firstOrNull()?.city,
                places = places.toList(),
            )
            val result = runCatching {
                if (collectionId != null) ApiClient.collections.update(collectionId, payload)
                else ApiClient.collections.create(payload)
            }
            saving = false
            result.fold(
                onSuccess = { onPublished(it.id) },
                onFailure = { error = it.message ?: "保存失败" },
            )
        }
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader(
            title = if (collectionId != null) "编辑收藏夹" else "发布收藏夹",
            onBack = onBack,
            trailing = {
                Text(
                    if (saving) "…" else if (collectionId != null) "保存" else "发布",
                    fontSize = 14.sp,
                    color = ZhijingColors.BrandHot,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable(enabled = !saving) { publish() },
                )
            },
        )

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
        } else {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                FieldLabel("标题")
                PublishInput(
                    value = title,
                    onValueChange = { title = it },
                    placeholder = "例如：常去的 8 个上海自习圣地",
                    singleLine = true,
                )

                FieldLabel("简介（可选）")
                PublishInput(
                    value = summary,
                    onValueChange = { summary = it },
                    placeholder = "写一句介绍",
                    singleLine = false,
                    minLines = 3,
                )

                FieldLabel("封面图标")
                Row(
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    EMOJIS.forEach { e ->
                        val on = emoji == e
                        Box(
                            Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (on) ZhijingColors.BrandSoft else ZhijingColors.BgSurface)
                                .then(
                                    if (on) Modifier.border(1.dp, ZhijingColors.Brand, RoundedCornerShape(12.dp))
                                    else Modifier,
                                )
                                .clickable { emoji = e },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(e, fontSize = 20.sp)
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))
                Text("添加地点", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = ZhijingColors.Ink)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ImportChip("＋ 手填") { showAddPlace = true }
                    ImportChip("从收藏导入") { importFavorites() }
                    ImportChip("从攻略导入") { openTripPicker() }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "高德搜点暂不可用，可用收藏/攻略导入或手填",
                    fontSize = 12.sp,
                    color = ZhijingColors.Muted,
                )

                if (streamQueue != null && streamingLeft > 0) {
                    Spacer(Modifier.height(10.dp))
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(ZhijingColors.BrandSoft)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = ZhijingColors.Brand,
                        )
                        Text(
                            "正在填入攻略地点… ${(streamQueue!!.size - streamingLeft + 1)}/${streamQueue!!.size}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZhijingColors.Ink,
                        )
                    }
                } else if (streamQueue != null && streamingLeft <= 0 && places.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(ZhijingColors.BrandSoft)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        Text(
                            "✅ 已从攻略填入 ${places.size} 个地点，可直接编辑或发布",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZhijingColors.BrandHot,
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))
                Text("地点 (${places.size})", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = ZhijingColors.Ink)
                Spacer(Modifier.height(8.dp))
                if (places.isEmpty()) {
                    Text("还没有地点", fontSize = 13.sp, color = ZhijingColors.Muted)
                } else {
                    places.forEachIndexed { i, p ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(ZhijingColors.Card)
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${i + 1}. ${p.name}",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                val sub = listOfNotNull(p.city, p.note, p.address)
                                    .filter { it.isNotBlank() }
                                    .joinToString(" · ")
                                if (sub.isNotBlank()) {
                                    Text(sub, fontSize = 11.sp, color = ZhijingColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            Text(
                                "删除",
                                fontSize = 13.sp,
                                color = ZhijingColors.Danger,
                                modifier = Modifier.clickable { places.removeAt(i) },
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                }
                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = ZhijingColors.Danger, fontSize = 13.sp)
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (showAddPlace) {
        AlertDialog(
            onDismissRequest = { showAddPlace = false },
            title = { Text("添加地点") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextField(addName, { addName = it }, placeholder = { Text("名称（必填）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    TextField(addCity, { addCity = it }, placeholder = { Text("城市") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    TextField(addAddress, { addAddress = it }, placeholder = { Text("地址（可选）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val n = addName.trim()
                    if (n.isEmpty()) {
                        Toast.makeText(context, "请填写名称", Toast.LENGTH_SHORT).show()
                        return@TextButton
                    }
                    mergePlaces(
                        listOf(
                            CollectionPlace(
                                name = n,
                                city = addCity.trim().ifBlank { null },
                                address = addAddress.trim().ifBlank { null },
                            ),
                        ),
                    )
                    addName = ""
                    addCity = ""
                    addAddress = ""
                    showAddPlace = false
                }) { Text("添加") }
            },
            dismissButton = {
                TextButton(onClick = { showAddPlace = false }) { Text("取消") }
            },
        )
    }

    if (tripPicker) {
        TripPickerSheet(
            trips = tripList,
            loading = loadingTrips,
            importing = importingTrip,
            onDismiss = { if (!importingTrip) tripPicker = false },
            onPick = { importFromTrip(it) },
        )
    }
}

/** 底部抽屉：选择攻略导入（对齐 RN tripPicker Modal） */
@Composable
private fun TripPickerSheet(
    trips: List<TripListItem>,
    loading: Boolean,
    importing: Boolean,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x61000000))
                .clickable(enabled = !importing, onClick = onDismiss),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                    .background(Color.White)
                    .clickable(onClick = {}) // 吞掉点击，避免点到遮罩关闭
                    .padding(horizontal = 20.dp)
                    .padding(top = 10.dp, bottom = 24.dp)
                    .heightIn(max = 520.dp),
            ) {
                Box(
                    Modifier
                        .align(Alignment.CenterHorizontally)
                        .width(36.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFFE6E6E6)),
                )
                Spacer(Modifier.height(14.dp))
                Text("选择攻略", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                Text(
                    "自动提取攻略中的地点填入编辑页（交通步骤已过滤）",
                    fontSize = 13.sp,
                    color = ZhijingColors.Muted,
                    modifier = Modifier.padding(top = 6.dp, bottom = 12.dp),
                )

                when {
                    loading -> Box(
                        Modifier
                            .fillMaxWidth()
                            .height(120.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = ZhijingColors.BrandHot)
                    }
                    trips.isEmpty() -> Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("🧳", fontSize = 32.sp)
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "还没有攻略，先去首页规划一个吧",
                            fontSize = 14.sp,
                            color = ZhijingColors.Muted,
                            textAlign = TextAlign.Center,
                        )
                    }
                    else -> LazyColumn(
                        Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                            .heightIn(max = 340.dp),
                    ) {
                        items(trips, key = { it.id }) { t ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !importing) { onPick(t.id) }
                                    .padding(vertical = 12.dp),
                            ) {
                                Text(
                                    t.title.ifBlank { "${t.destination}行程" },
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ZhijingColors.Ink,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(Modifier.height(3.dp))
                                Text(
                                    "${t.destination} · ${t.startDate} → ${t.endDate}",
                                    fontSize = 12.sp,
                                    color = ZhijingColors.Muted,
                                )
                            }
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height(0.5.dp)
                                    .background(ZhijingColors.Line),
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(22.dp))
                        .background(ZhijingColors.BrandSoft)
                        .clickable(enabled = !importing, onClick = onDismiss)
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (importing) "提取中…" else "取消",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZhijingColors.BrandHot,
                    )
                }
            }
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        color = ZhijingColors.Ink,
        modifier = Modifier.padding(top = 12.dp, bottom = 6.dp),
    )
}

@Composable
private fun PublishInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    singleLine: Boolean,
    minLines: Int = 1,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = singleLine,
        minLines = if (singleLine) 1 else minLines,
        textStyle = TextStyle(fontSize = 15.sp, color = ZhijingColors.Ink, lineHeight = 22.sp),
        cursorBrush = SolidColor(ZhijingColors.BrandHot),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(ZhijingColors.BgSurface)
            .then(if (!singleLine) Modifier.heightIn(min = 72.dp) else Modifier)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) {
                    Text(placeholder, fontSize = 15.sp, color = ZhijingColors.Muted, lineHeight = 22.sp)
                }
                inner()
            }
        },
    )
}

@Composable
private fun ImportChip(label: String, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 13.sp,
        color = ZhijingColors.BrandHot,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(ZhijingColors.BrandSoft)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}
