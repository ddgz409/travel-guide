package com.travelguide.app.ui.screens.trip

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.core.content.FileProvider
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.graphics.Color
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.widget.Toast
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.api.CitySpotDto
import com.travelguide.app.data.api.GenerateProgressEvent
import com.travelguide.app.data.api.SharePayload
import com.travelguide.app.data.api.ItemUpdatePayload
import com.travelguide.app.data.api.TripUpdatePayload
import com.travelguide.app.data.api.CityAddPayload
import com.travelguide.app.data.model.Day
import com.travelguide.app.data.model.Item
import com.travelguide.app.data.model.Location
import com.travelguide.app.data.model.PoiSearchResult
import com.travelguide.app.data.model.ReorderEntry
import com.travelguide.app.data.model.ReorderPayload
import com.travelguide.app.data.model.Trip
import com.travelguide.app.ui.components.DraggableBottomSheet
import com.travelguide.app.ui.components.HeroRouteMap
import com.travelguide.app.ui.navigation.MapMarkerNav
import com.travelguide.app.data.util.polylinesFromItems
import com.travelguide.app.data.util.polylinesFromTripDays
import com.travelguide.app.data.util.resolveDayAnchor
import com.travelguide.app.data.util.routeModeForTransport
import com.travelguide.app.data.util.routeItemMarkers
import com.travelguide.app.data.util.ShareChoicePayload
import com.travelguide.app.ui.components.PoiDetailSheet
import com.travelguide.app.ui.components.ShareChoiceSheet
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

import com.travelguide.app.data.util.ShareUrl

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
    onOpenChat: (String) -> Unit,
    onOpenSettlement: () -> Unit = {},
    onOpenPublish: () -> Unit = {},
    onOpenItemDetail: (String) -> Unit = {},
    onOpenMapFull: (String?, List<com.travelguide.app.ui.navigation.MapMarkerNav>, List<List<List<Double>>>) -> Unit = { _, _, _ -> },
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
    var shareChoicePayload by remember { mutableStateOf<ShareChoicePayload?>(null) }
    var pickMode by remember { mutableStateOf(false) }
    var addCoords by remember { mutableStateOf<Location?>(null) }

    var detailItemId by remember { mutableStateOf<String?>(null) }

    // 生成中视图状态（对齐 RN genMessage/genReadable/genPhase/genStreaming）
    var genMessage by remember { mutableStateOf("正在启动生成…") }
    var genReadable by remember { mutableStateOf("") }
    var genPhase by remember { mutableStateOf("") }
    var genStreaming by remember { mutableStateOf(true) }
    var addSpotVisible by remember { mutableStateOf(false) }
    var citySheetVisible by remember { mutableStateOf(false) }
    var deleteItem by remember { mutableStateOf<Item?>(null) }
    var deleteCity by remember { mutableStateOf<String?>(null) }

    // 标题长按改名：充能 → 飞行 → 编辑
    var renamePhase by remember { mutableStateOf(RenamePhase.None) }
    var renameDraft by remember { mutableStateOf("") }
    var renameSaving by remember { mutableStateOf(false) }
    var renameExiting by remember { mutableStateOf(false) }
    var titleBounds by remember { mutableStateOf<Rect?>(null) }
    var titleHandedOff by remember { mutableStateOf(false) }
    val titleCharge = remember { Animatable(0f) }

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

    // 长按标题后：双环顺时针充注 2s，充满切到飞行过渡
    LaunchedEffect(renamePhase) {
        if (renamePhase == RenamePhase.Charging) {
            titleCharge.snapTo(0f)
            titleCharge.animateTo(1f, tween(2000, easing = LinearEasing))
            renamePhase = RenamePhase.Flying
        }
    }

    fun toast(msg: String) = Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
    fun snackBar(msg: String) = scope.launch { snackbar.showSnackbar(msg) }

    fun startTitleRename() {
        val t = trip ?: return
        if (renamePhase != RenamePhase.None) return
        renameDraft = t.title
        titleHandedOff = false
        renamePhase = RenamePhase.Charging
    }

    fun closeTitleRename() {
        if (renameExiting) return
        renameExiting = true
    }

    fun confirmTitleRename() {
        val t = trip ?: return
        val next = renameDraft.trim()
        if (next.isEmpty()) {
            toast("标题不能为空")
            return
        }
        if (next == t.title) {
            closeTitleRename()
            return
        }
        if (renameSaving) return
        renameSaving = true
        scope.launch {
            try {
                trip = ApiClient.trips.update(t.id, TripUpdatePayload(title = next))
                toast("标题已更新")
                closeTitleRename()
            } catch (e: Exception) {
                snackBar(e.message ?: "标题保存失败")
            } finally {
                renameSaving = false
            }
        }
    }

    BackHandler(enabled = renamePhase != RenamePhase.None) {
        if (renamePhase == RenamePhase.Charging) {
            renamePhase = RenamePhase.None
        } else {
            closeTitleRename()
        }
    }

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

    fun onExportPdf() {
        val t = trip ?: return
        if (TokenStore.getSync() == null) {
            toast("登录后才能导出 PDF")
            return
        }
        scope.launch {
            busy = true
            try {
                val bytes = withContext(Dispatchers.IO) { ApiClient.trips.exportPdf(t.id).bytes() }
                val safe = (t.title.ifBlank { "trip" }).replace(Regex("[^\\w\\u4e00-\\u9fff\\-]+"), "_")
                val file = File(context.cacheDir, "$safe.pdf")
                file.writeBytes(bytes)
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "application/pdf"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(send, "分享 PDF"))
            } catch (e: Exception) {
                toast("导出失败：${e.message ?: "请重试"}")
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
                val url = ShareUrl.forToken(token)
                clipboard.setText(AnnotatedString(url))
                shareMsg = url
                shareChoicePayload = ShareChoicePayload(
                    url = url,
                    title = "邀请你一起编辑知径攻略「${updated.title}」",
                    message = "邀请你一起编辑知径攻略「${updated.title}」（需登录）\n$url",
                )
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
        if (activeDay == TRIP_OVERVIEW_TAB) {
            toast("请先切换到具体某一天")
            return
        }
        val day = t.days.getOrNull(activeDay) ?: return
        val dayIndex = day.dayIndex
        val beforeKey = day.items.joinToString("|") { "${it.id}:${it.name}:${it.seq}" }
        if (busy) return
        busy = true
        scope.launch {
            try {
                ApiClient.trips.regenerateDay(t.id, dayIndex)
                var last: Trip? = null
                repeat(40) {
                    delay(2500)
                    val latest = ApiClient.trips.get(t.id)
                    last = latest
                    if (latest.status == "failed") {
                        trip = latest
                        snackBar(latest.errorMsg ?: "重新生成失败")
                        return@launch
                    }
                    val updated = latest.days.find { it.dayIndex == dayIndex }
                    val key = updated?.items?.joinToString("|") { "${it.id}:${it.name}:${it.seq}" } ?: ""
                    if (key.isNotEmpty() && key != beforeKey) {
                        trip = latest
                        toast("当天行程已更新")
                        return@launch
                    }
                }
                last?.let { trip = it }
                snackBar("重新生成耗时较长，请稍后再看或重试")
            } catch (e: Exception) {
                snackBar(e.message ?: "重新生成失败")
            } finally {
                busy = false
            }
        }
    }

    fun onReplanDay() {
        val t = trip ?: return
        val day = t.days.getOrNull(activeDay) ?: return
        runBusy { ApiClient.trips.replanDay(t.id, day.id) }
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
        val dayIdx = if (activeDay == TRIP_OVERVIEW_TAB) 0 else activeDay
        val day = t.days.getOrNull(dayIdx) ?: return
        if (poi.location == null) {
            Toast.makeText(context, "该地点缺少坐标，无法添加", Toast.LENGTH_SHORT).show()
            return
        }
        addSpotVisible = false
        addCoords = null
        pickMode = false
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
                    val isOverview = activeDay == TRIP_OVERVIEW_TAB
                    val currentDay = if (isOverview) null else days.getOrNull(activeDay) ?: days.firstOrNull()
                    val overviewItems = remember(days) {
                        days.flatMap { it.items }.filter { it.selected && it.location != null }
                    }
                    val dayItems = currentDay?.items.orEmpty()
                    val mapItems = if (isOverview) overviewItems else dayItems
                    val overviewPolylines = remember(days) { polylinesFromTripDays(days) }
                    val selectedCount = if (isOverview) overviewItems.size else dayItems.count { it.selected }
                    val canEdit = t.canEdit ?: true
                    val routeOptions = t.preferences.routeOptions.orEmpty()
                    val selectedRouteId = t.preferences.selectedRouteId ?: routeOptions.firstOrNull()?.id
                    val detailItem = detailItemId?.let { id ->
                        days.flatMap { it.items }.firstOrNull { it.id == id }
                    }

                    val allTripItems = days.flatMap { it.items }
                    val chipsTop = if (days.isNotEmpty()) 108.dp else 72.dp
                    var sheetFraction by remember { mutableFloatStateOf(0.52f) }

                    Box(Modifier.fillMaxSize()) {
                        HeroRouteMap(
                            tripId = t.id,
                            dayId = if (isOverview) null else currentDay?.id,
                            items = mapItems,
                            categoryItems = allTripItems,
                            destination = t.destination,
                            routeMode = routeModeForTransport(t.preferences.transport),
                            pickMode = pickMode,
                            polylineOverride = if (isOverview) overviewPolylines else null,
                            bottomSheetFraction = sheetFraction,
                            onMapPick = { lng, lat ->
                                pickMode = false
                                addCoords = Location(lng = lng, lat = lat)
                                addSpotVisible = true
                            },
                            fill = true,
                            chipsTopPadding = chipsTop,
                            onMarkerClick = { id -> if (id != null && !pickMode) detailItemId = id },
                            onExpand = {
                                val markers = routeItemMarkers(mapItems)
                                onOpenMapFull(
                                    if (isOverview) "全程总览" else "第 ${currentDay?.dayIndex ?: activeDay + 1} 天路线",
                                    markers.map { MapMarkerNav(it.lng, it.lat, it.name) },
                                    if (isOverview) overviewPolylines
                                    else polylinesFromItems(dayItems.filter { it.selected && it.location != null }),
                                )
                            },
                        )

                        Column(
                            Modifier
                                .align(Alignment.TopStart)
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Row(
                                Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    Modifier
                                        .shadow(4.dp, RoundedCornerShape(12.dp))
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color.White.copy(alpha = 0.96f))
                                        .clickable(onClick = onBack)
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                ) {
                                    Text("‹", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                                }
                                Spacer(Modifier.width(8.dp))
                                Column(Modifier.weight(1f)) {
                                    TripTitlePill(
                                        title = t.title,
                                        charging = renamePhase == RenamePhase.Charging,
                                        hidden = titleHandedOff,
                                        chargeProgress = { titleCharge.value },
                                        onBounds = { titleBounds = it },
                                        onLongPress = { if (canEdit) startTitleRename() },
                                    )
                                    Spacer(Modifier.height(3.dp))
                                    Text(
                                        "${t.destination} · ${t.startDate} → ${t.endDate} · ${t.travelers}人" +
                                            (t.budgetTotal?.let { " · 约 ¥${kotlin.math.round(it)}" } ?: ""),
                                        fontSize = 12.sp,
                                        color = ZhijingColors.Muted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                if (canEdit) {
                                    Box(
                                        Modifier
                                            .shadow(4.dp, RoundedCornerShape(12.dp))
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(Color.White.copy(alpha = 0.96f))
                                            .clickable(enabled = !busy) { citySheetVisible = true }
                                            .padding(horizontal = 12.dp, vertical = 8.dp),
                                    ) {
                                        Text("＋ 城市", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.BrandHot)
                                    }
                                }
                            }
                            if (days.isNotEmpty()) {
                                Spacer(Modifier.height(8.dp))
                                DayTabs(
                                    days = days,
                                    activeDay = activeDay,
                                    onSelect = { i ->
                                        activeDay = i
                                        pickMode = false
                                        if (i == TRIP_OVERVIEW_TAB) editing = false
                                    },
                                )
                            }
                        }

                        if (pickMode) {
                            Row(
                                Modifier
                                    .align(Alignment.TopCenter)
                                    .padding(top = chipsTop + 4.dp, start = 16.dp, end = 16.dp)
                                    .fillMaxWidth()
                                    .shadow(4.dp, RoundedCornerShape(14.dp))
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color.White.copy(alpha = 0.96f))
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    "👇 在地图上点击要添加的位置",
                                    Modifier.weight(1f),
                                    fontSize = 13.sp,
                                    color = ZhijingColors.Ink,
                                )
                                Text(
                                    "取消",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ZhijingColors.BrandHot,
                                    modifier = Modifier.clickable { pickMode = false },
                                )
                            }
                        }

                        DraggableBottomSheet(
                            modifier = Modifier.fillMaxSize(),
                            initialFraction = 0.52f,
                            onFractionChange = { sheetFraction = it },
                        ) {
                            if (editing && canEdit && !isOverview) {
                                Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
                                    DayHeadActions(
                                        busy = busy,
                                        editing = true,
                                        onRegenDay = ::onRegenDay,
                                        onReplanDay = ::onReplanDay,
                                        onAddSpot = { pickMode = true },
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
                                LazyColumn(
                                    Modifier.fillMaxSize(),
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    item { ShareBanner(shareMsg, busy, ::onShare) }
                                    item {
                                        ActionsRow(
                                            shareToken = t.shareToken,
                                            busy = busy,
                                            onAskAi = { onOpenChat("") },
                                            onOpenSharePage = { token ->
                                                try {
                                                    context.startActivity(
                                                        Intent(Intent.ACTION_VIEW, android.net.Uri.parse(ShareUrl.forToken(token))),
                                                    )
                                                } catch (_: Exception) {
                                                }
                                            },
                                            onExportPdf = ::onExportPdf,
                                            onPublish = onOpenPublish,
                                            onSettlement = onOpenSettlement,
                                        )
                                    }
                                    if (isOverview) {
                                        item {
                                            TripOverviewSection(
                                                trip = t,
                                                days = days,
                                                onSelectDay = { dayIndex ->
                                                    activeDay = dayIndex
                                                    pickMode = false
                                                },
                                                onItemClick = { detailItemId = it },
                                            )
                                        }
                                    } else {
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
                                                    onAddSpot = { pickMode = true },
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
                                        dayItems.forEachIndexed { idx, item ->
                                            item(key = item.id) {
                                                val hasNextRoute = dayItems.drop(idx + 1).any { it.selected && it.location != null }
                                                NormalItemRow(
                                                    item = item,
                                                    tripId = t.id,
                                                    hasNextRoute = hasNextRoute,
                                                    city = t.destination,
                                                    onClick = { detailItemId = item.id },
                                                )
                                            }
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
                    }

                    // ---------- 弹层 ----------
                    detailItem?.let { di ->
                        // 与城市攻略共用同一套详情底单（对齐 RN TripDetail 复用 PoiDetailSheet）
                        PoiDetailSheet(
                            item = CitySpotDto(
                                name = di.name,
                                desc = di.description?.trim().orEmpty(),
                                lng = di.location?.lng,
                                lat = di.location?.lat,
                                address = di.location?.address,
                            ),
                            category = when (di.type) {
                                "meal" -> "foods"
                                "hotel" -> "hotels"
                                else -> "spots"
                            },
                            city = t.destination,
                            onClose = { detailItemId = null },
                            onFeedback = { msg ->
                                detailItemId = null
                                onOpenChat(msg)
                            },
                            tripId = t.id,
                            tripItemId = di.id,
                            tripItemSelected = di.selected,
                            tripAlternatives = di.alternatives,
                            tripCanEdit = canEdit,
                            onTripUpdated = { updated -> trip = updated },
                            onSwapped = { detailItemId = null },
                        )
                    }
                    if (addSpotVisible) {
                        AddSpotSheet(
                            dayCity = currentDay?.city,
                            tripDestination = t.destination,
                            dayLabel = currentDay?.let { "第 ${it.dayIndex} 天${it.city?.let { c -> " · $c" } ?: ""}" } ?: "",
                            busy = busy,
                            anchor = resolveDayAnchor(currentDay, addCoords),
                            pickedLocation = addCoords,
                            onSelectPoi = ::onAddPoi,
                            onDismiss = {
                                addSpotVisible = false
                                addCoords = null
                                pickMode = false
                            },
                        )
                    }
                    ShareChoiceSheet(
                        payload = shareChoicePayload,
                        onClose = { shareChoicePayload = null },
                    )
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

                    if (renamePhase == RenamePhase.Flying || renamePhase == RenamePhase.Editing) {
                        TripRenameOverlay(
                            titleRect = titleBounds,
                            draftTitle = renameDraft,
                            saving = renameSaving,
                            exiting = renameExiting,
                            onDraftChange = { renameDraft = it },
                            onConfirm = { confirmTitleRename() },
                            onCancelRequest = { closeTitleRename() },
                            onReady = { titleHandedOff = true },
                            onLanded = { renamePhase = RenamePhase.Editing },
                            onClosed = {
                                renamePhase = RenamePhase.None
                                renameExiting = false
                                titleHandedOff = false
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
