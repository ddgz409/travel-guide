package com.travelguide.app.ui.screens.trip

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.widget.Toast
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.api.GenerateProgressEvent
import com.travelguide.app.data.api.SharePayload
import com.travelguide.app.data.api.ItemUpdatePayload
import com.travelguide.app.data.api.CityAddPayload
import com.travelguide.app.data.model.Day
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.model.PoiSearchResult
import com.travelguide.app.data.model.ReorderEntry
import com.travelguide.app.data.model.ReorderPayload
import com.travelguide.app.data.model.Trip
import com.travelguide.app.ui.components.MapHeader
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 分享页地址（与 RN shareUrl.ts 一致：后端 8000 端口直接渲染） */
private const val PUBLIC_SHARE_BASE = "http://81.71.159.218:8000"

/**
 * 阶段 2 完整行程详情（替代阶段 0 PoC）：
 * - 顶栏 + 天切换 + 地图 + 内容区（分享/操作/路线方案/当天操作/行程列表/预算/酒店/协作者）
 * - 编辑态：紧凑行 + ✕ 删除 + ≡ 拖拽（松手提交）
 * - 生成中：轮询；协作模式：4s 轮询
 */
@Composable
fun TripDetailScreen(
    tripId: String,
    onBack: () -> Unit,
    onOpenChat: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val snackbar = remember { SnackbarHostState() }

    var trip by remember { mutableStateOf<Trip?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var activeDay by remember { mutableStateOf(0) }
    var editing by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var shareMsg by remember { mutableStateOf<String?>(null) }

    var detailItemId by remember { mutableStateOf<String?>(null) }
    var mapHeight by remember { mutableStateOf(220.dp) }

    // 生成中视图状态（对齐 RN genMessage/genReadable/genPhase/genStreaming）
    var genMessage by remember { mutableStateOf("正在启动生成…") }
    var genReadable by remember { mutableStateOf("") }
    var genPhase by remember { mutableStateOf("") }
    var genStreaming by remember { mutableStateOf(true) }
    var addSpotVisible by remember { mutableStateOf(false) }
    var citySheetVisible by remember { mutableStateOf(false) }
    var deleteItem by remember { mutableStateOf<Item?>(null) }
    var deleteCity by remember { mutableStateOf<String?>(null) }

    suspend fun load(): Trip? = try {
        val data = ApiClient.trips.get(tripId)
        trip = data
        error = null
        data
    } catch (e: Exception) {
        error = e.message ?: "加载失败"
        null
    }

    LaunchedEffect(tripId) { load() }

    // 生成中：订阅 generate-stream SSE 拿阶段/流式文本；3s 轮询兼底状态切换
    // （status 局部量在下方才声明，这里直接读 trip?.status 避免前向引用）
    LaunchedEffect(tripId, trip?.status) {
        if (trip?.status != "generating") return@LaunchedEffect
        genMessage = "正在启动生成…"
        genReadable = ""
        genPhase = ""
        genStreaming = true
        val call = ApiClient.trips.generateStream(tripId)
        try {
            withContext(Dispatchers.IO) {
                val resp = call.execute()
                if (!resp.isSuccessful) return@withContext
                val source = resp.body()!!.source()
                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    if (!line.startsWith("data: ")) continue
                    val evt = runCatching {
                        AppJson.decodeFromString<GenerateProgressEvent>(line.removePrefix("data: ").trim())
                    }.getOrNull() ?: continue
                    withContext(Dispatchers.Main) {
                        evt.phase?.let { genPhase = it }
                        evt.message?.let { genMessage = it.replace("**", "") }
                        evt.readable?.let { genReadable = it; genStreaming = true }
                        if (evt.done || evt.status == "ready" || evt.status == "failed") {
                            genStreaming = false
                        }
                    }
                }
            }
        } catch (_: Exception) {
            // SSE 失败静默降级到轮询
        } finally {
            call.cancel()
        }
    }

    // 生成中：3s 轮询；协作模式：4s 轮询（对齐 RN 版）
    val status = trip?.status
    val shareMode = trip?.shareMode
    LaunchedEffect(tripId, status, shareMode) {
        when {
            status == "generating" -> while (isActive) {
                delay(3000)
                if (load()?.status != "generating") break
            }
            shareMode == "collab" -> while (isActive) {
                delay(4000)
                load()
            }
        }
    }

    fun toast(msg: String) = Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
    fun snackBar(msg: String) = scope.launch { snackbar.showSnackbar(msg) }

    // ---------- 操作（全部对齐 RN TripDetailScreen 的 handler） ----------

    fun runBusy(action: suspend () -> Trip?) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                action()?.let { trip = it }
            } catch (e: Exception) {
                snackBar(e.message ?: "操作失败")
            } finally {
                busy = false
            }
        }
    }

    fun onShare() {
        val t = trip ?: return
        runBusy {
            val updated = ApiClient.trips.createShare(t.id, SharePayload(mode = "collab"))
            updated.shareToken?.let { token ->
                val url = "$PUBLIC_SHARE_BASE/share/$token"
                clipboard.setText(AnnotatedString(url))
                shareMsg = url
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, "邀请你一起编辑知径攻略「${updated.title}」（需登录）\n$url")
                }
                context.startActivity(Intent.createChooser(send, "分享行程"))
            }
            updated
        }
    }

    fun onSelectRoute(routeId: String) {
        val t = trip ?: return
        runBusy { ApiClient.trips.selectRoute(t.id, routeId).also { activeDay = 0 } }
    }

    fun onRegenDay() {
        val t = trip ?: return
        val day = t.days.getOrNull(activeDay) ?: return
        runBusy { ApiClient.trips.regenerateDay(t.id, day.dayIndex) }
    }

    fun onReplanDay() {
        val t = trip ?: return
        val day = t.days.getOrNull(activeDay) ?: return
        runBusy { ApiClient.trips.replanDay(t.id, day.id) }
    }

    fun onToggleSelected(item: Item, selected: Boolean) {
        val t = trip ?: return
        runBusy { ApiClient.trips.updateItem(t.id, item.id, ItemUpdatePayload(selected = selected)) }
    }

    fun doDeleteItem(item: Item) {
        val t = trip ?: return
        runBusy { ApiClient.trips.deleteItem(t.id, item.id) }
    }

    fun onCommitReorder(day: Day, ordered: List<Item>) {
        val t = trip ?: return
        scope.launch {
            try {
                val payload = ReorderPayload(ordered.mapIndexed { i, it -> ReorderEntry(it.id, i) })
                trip = ApiClient.trips.reorderItems(t.id, day.id, payload)
            } catch (_: Exception) {
                snackBar("排序保存失败，顺序可能未同步到云端")
            }
        }
    }

    fun onAddPoi(poi: PoiSearchResult, type: String) {
        val t = trip ?: return
        val day = t.days.getOrNull(activeDay) ?: return
        addSpotVisible = false
        runBusy {
            ApiClient.trips.addItem(
                t.id,
                day.id,
                com.travelguide.app.data.model.ItemCreate(
                    name = poi.name,
                    poiId = poi.poiId,
                    location = poi.location,
                    type = type,
                ),
            )
        }
    }

    fun onAddCustom(name: String, type: String) {
        val t = trip ?: return
        val day = t.days.getOrNull(activeDay) ?: return
        addSpotVisible = false
        runBusy {
            ApiClient.trips.addItem(
                t.id,
                day.id,
                com.travelguide.app.data.model.ItemCreate(name = name, type = type),
            )
        }
    }

    fun onAddCity(city: String, position: Int) {
        val t = trip ?: return
        citySheetVisible = false
        runBusy {
            ApiClient.trips.addCity(t.id, CityAddPayload(city, position)).also {
                activeDay = (position - 1).coerceIn(0, (it.days.size - 1).coerceAtLeast(0))
            }
        }
    }

    fun doDeleteCity(city: String) {
        val t = trip ?: return
        runBusy {
            ApiClient.trips.deleteCity(t.id, city).also {
                activeDay = activeDay.coerceAtMost((it.days.size - 1).coerceAtLeast(0))
            }
        }
    }

    // ---------- 状态分支 ----------

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }, containerColor = ZhijingColors.Bg) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when {
                error != null && trip == null -> CenterMessage(error!!, "重试") {
                    error = null
                    scope.launch { load() }
                }
                trip == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = ZhijingColors.BrandHot)
                }
                trip!!.status == "generating" -> TripGeneratingView(
                    trip = trip!!,
                    message = genMessage,
                    readable = genReadable,
                    phase = genPhase,
                    streaming = genStreaming,
                    onBack = onBack,
                )
                trip!!.status == "failed" -> CenterMessage(
                    "生成失败：${trip!!.errorMsg ?: "目的地可能不存在或暂无法生成"}",
                    null,
                ) {}
                else -> {
                    val t = trip!!
                    val days = t.days
                    val currentDay = days.getOrNull(activeDay) ?: days.firstOrNull()
                    val dayItems = currentDay?.items.orEmpty()
                    val selectedCount = dayItems.count { it.selected }
                    val canEdit = t.canEdit ?: true
                    val routeOptions = t.preferences.routeOptions.orEmpty()
                    val selectedRouteId = t.preferences.selectedRouteId ?: routeOptions.firstOrNull()?.id
                    val detailItem = detailItemId?.let { id ->
                        days.flatMap { it.items }.firstOrNull { it.id == id }
                    }

                    Column(Modifier.fillMaxSize()) {
                        // 顶栏
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(ZhijingColors.Card)
                                    .clickable(onClick = onBack)
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            ) {
                                Text("‹", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.width(8.dp))
                            Column(Modifier.weight(1f)) {
                                Text(t.title, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${t.destination} · ${t.startDate} → ${t.endDate} · ${t.travelers}人" +
                                        (t.budgetTotal?.let { " · 约 ¥${Math.round(it)}" } ?: ""),
                                    fontSize = 12.sp,
                                    color = ZhijingColors.Muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            if (canEdit) {
                                Box(
                                    Modifier
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(ZhijingColors.BrandSoft)
                                        .clickable(enabled = !busy) { citySheetVisible = true }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                ) {
                                    Text("＋ 城市", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.BrandHot)
                                }
                            }
                        }

                        // 天切换
                        if (days.size > 1) {
                            DayTabs(days, activeDay) { i -> activeDay = i }
                        }

                        // 地图（高度可调：拖动手柄上拉压缩、下拉放大，复刻 RN 版抽屉交互）
                        MapHeader(
                            items = dayItems,
                            height = mapHeight,
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                        val density = LocalDensity.current
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(26.dp)
                                .pointerInput(Unit) {
                                    detectVerticalDragGestures { _, dragAmount ->
                                        mapHeight = (mapHeight + (dragAmount / density.density).dp)
                                            .coerceIn(96.dp, 520.dp)
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                Modifier
                                    .width(44.dp)
                                    .height(5.dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(ZhijingColors.Line),
                            )
                        }

                        if (editing && canEdit) {
                            // 编辑态：紧凑列表独占滚动区
                            Column(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp)) {
                                DayHeadActions(
                                    busy = busy,
                                    editing = true,
                                    onRegenDay = ::onRegenDay,
                                    onReplanDay = ::onReplanDay,
                                    onAddSpot = { addSpotVisible = true },
                                    onToggleEdit = { editing = false },
                                )
                                Spacer(Modifier.height(8.dp))
                                Text("精选行程 · $selectedCount 个安排", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                                Text("点击卡片 ✕ 删除 · 长按右侧 ≡ 手柄拖动排序", fontSize = 12.sp, color = ZhijingColors.Muted)
                                Spacer(Modifier.height(8.dp))
                                EditableDayList(
                                    items = dayItems,
                                    dayId = currentDay?.id,
                                    busy = busy,
                                    externalItems = dayItems,
                                    onRemove = { deleteItem = it },
                                    onCommitOrder = { ordered -> onCommitReorder(currentDay!!, ordered) },
                                )
                            }
                        } else {
                            // 常规模式：全部内容一个滚动容器
                            LazyColumn(
                                Modifier.fillMaxWidth().weight(1f),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                item { ShareBanner(shareMsg, busy, ::onShare) }
                                item {
                                    ActionsRow(
                                        shareToken = t.shareToken,
                                        busy = busy,
                                        onAskAi = onOpenChat,
                                        onOpenSharePage = { token ->
                                            try {
                                                context.startActivity(
                                                    Intent(Intent.ACTION_VIEW, android.net.Uri.parse("$PUBLIC_SHARE_BASE/share/$token")),
                                                )
                                            } catch (_: Exception) {
                                            }
                                        },
                                        onTodoFeature = { name -> toast("「$name」将在后续版本上线") },
                                    )
                                }
                                if (routeOptions.isNotEmpty()) {
                                    item {
                                        RouteOptionsBar(routeOptions, selectedRouteId, enabled = canEdit && !busy, onSelect = ::onSelectRoute)
                                    }
                                }
                                if (canEdit) {
                                    item {
                                        DayHeadActions(
                                            busy = busy,
                                            editing = false,
                                            onRegenDay = ::onRegenDay,
                                            onReplanDay = ::onReplanDay,
                                            onAddSpot = { addSpotVisible = true },
                                            onToggleEdit = { editing = true },
                                        )
                                    }
                                }
                                item {
                                    Column {
                                        Text("精选行程 · $selectedCount 个安排", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                                        if (canEdit) {
                                            Text("点「编辑」可删除或长按 ≡ 手柄拖动调整顺序", fontSize = 12.sp, color = ZhijingColors.Muted)
                                        }
                                    }
                                }
                                // 常规行（含未选中项，灰显）
                                dayItems.forEachIndexed { idx, item ->
                                    item(key = item.id) {
                                        val hasNextRoute = dayItems.drop(idx + 1).any { it.selected && it.location != null }
                                        NormalItemRow(
                                            item = item,
                                            hasNextRoute = hasNextRoute,
                                            city = t.destination,
                                            onClick = {
                                                if (item.type == "attraction" || item.type == "meal" || item.type == "hotel") {
                                                    detailItemId = item.id
                                                } else {
                                                    detailItemId = item.id
                                                }
                                            },
                                        )
                                    }
                                }
                                item {
                                    val budgetByType = linkedMapOf<String, Double>()
                                    days.forEach { d ->
                                        d.items.forEach { it2 ->
                                            if (it2.selected) {
                                                budgetByType[it2.type] = (budgetByType[it2.type] ?: 0.0) + (it2.cost ?: 0.0)
                                            }
                                        }
                                    }
                                    val totalCost = budgetByType.values.sum()
                                    val totalBudget = t.budgetTotal ?: (totalCost * t.travelers)
                                    BudgetSection(budgetByType, t.travelers, totalBudget)
                                }
                                item {
                                    HotelNotesSection(t.destination, t.hotelFetchStatus, t.hotelCandidates)
                                }
                                if (!t.collaborators.isNullOrEmpty()) {
                                    item { CollaboratorsRow(t.collaborators) }
                                }
                                item { Spacer(Modifier.height(12.dp)) }
                            }
                        }
                    }

                    // ---------- 弹层 ----------
                    detailItem?.let { di ->
                        ItemDetailSheet(
                            item = di,
                            city = t.destination,
                            onToggleSelected = { sel -> onToggleSelected(di, sel) },
                            onDismiss = { detailItemId = null },
                        )
                    }
                    if (addSpotVisible) {
                        AddSpotSheet(
                            city = t.destination,
                            dayLabel = currentDay?.let { "第 ${it.dayIndex} 天${it.city?.let { c -> " · $c" } ?: ""}" } ?: "",
                            busy = busy,
                            // 锚点：优先当天第一个有坐标的点，其次全行程（多城路线名下逆地理定位城市）
                            anchor = currentDay?.items?.firstNotNullOfOrNull { it.location }
                                ?: t.days.flatMap { it.items }.firstNotNullOfOrNull { it.location },
                            onSelectPoi = ::onAddPoi,
                            onAddCustom = ::onAddCustom,
                            onDismiss = { addSpotVisible = false },
                        )
                    }
                    if (citySheetVisible) {
                        AddCitySheet(
                            trip = t,
                            busy = busy,
                            onAddCity = ::onAddCity,
                            onDeleteCity = { deleteCity = it },
                            onDismiss = { citySheetVisible = false },
                        )
                    }
                    deleteItem?.let { di ->
                        AlertDialog(
                            onDismissRequest = { deleteItem = null },
                            title = { Text("删除地点") },
                            text = { Text("确定从当天行程中删除「${di.name}」吗？") },
                            confirmButton = {
                                TextButton(onClick = { deleteItem = null; doDeleteItem(di) }) {
                                    Text("删除", color = ZhijingColors.Danger)
                                }
                            },
                            dismissButton = {
                                TextButton(onClick = { deleteItem = null }) { Text("取消") }
                            },
                        )
                    }
                    deleteCity?.let { city ->
                        AlertDialog(
                            onDismissRequest = { deleteCity = null },
                            title = { Text("删除城市") },
                            text = { Text("确定从路线中移除「$city」吗？该城市出现的所有天都会被删除。") },
                            confirmButton = {
                                TextButton(onClick = { deleteCity = null; doDeleteCity(city) }) {
                                    Text("删除", color = ZhijingColors.Danger)
                                }
                            },
                            dismissButton = {
                                TextButton(onClick = { deleteCity = null }) { Text("取消") }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CenterMessage(msg: String, actionLabel: String?, onAction: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (actionLabel == null) {
            CircularProgressIndicator(color = ZhijingColors.BrandHot)
            Spacer(Modifier.height(16.dp))
        }
        Text(msg, fontSize = 14.sp, color = ZhijingColors.Muted, lineHeight = 22.sp)
        if (actionLabel != null) {
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onAction,
                colors = ButtonDefaults.buttonColors(containerColor = ZhijingColors.BrandHot),
            ) {
                Text(actionLabel)
            }
        }
    }
}
