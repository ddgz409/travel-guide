package com.travelguide.app.ui.screens.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.GeneratePayload
import com.travelguide.app.data.api.GenPreferences
import com.travelguide.app.data.api.OptimizePlanQueryRequest
import com.travelguide.app.data.api.ValidateDestinationPayload
import com.travelguide.app.data.local.GuestStore
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.local.toLlmOverride
import com.travelguide.app.ui.components.ModelPickerSheet
import com.travelguide.app.ui.components.rememberModelPicker
import com.travelguide.app.data.util.PlanNavigateAction
import com.travelguide.app.data.util.SmartPlanDraft
import com.travelguide.app.data.util.buildExpandedQuery
import com.travelguide.app.data.util.detectPlanIntent
import com.travelguide.app.data.util.parseSmartPlanKeywords
import com.travelguide.app.data.util.searchPlanSuggestions
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 智能规划面板（对齐 RN SmartPlanPanel） */
@Composable
fun SmartPlanPanel(
    onClose: () -> Unit,
    onOpenTrip: (String) -> Unit,
    onStepChange: (String) -> Unit = {},
    backHandlerRef: androidx.compose.runtime.MutableState<(() -> Boolean)?>? = null,
    onOpenModelManage: () -> Unit = {},
) {
    val modelPicker = rememberModelPicker(onOpenModelManage)
    var keywords by remember { mutableStateOf("") }
    var draft by remember { mutableStateOf<SmartPlanDraft?>(null) }
    var editableQuery by remember { mutableStateOf("") }
    var optimizing by remember { mutableStateOf(false) }
    var optimizeError by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    var submitError by remember { mutableStateOf<String?>(null) }
    var placeCheck by remember { mutableStateOf<com.travelguide.app.data.api.ValidateDestinationResult?>(null) }
    var placeChecking by remember { mutableStateOf(false) }
    val optimizeSeq = remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val suggestions = remember(keywords) { searchPlanSuggestions(keywords) }

    LaunchedEffect(draft) {
        onStepChange(if (draft != null) "confirm" else "search")
    }

    LaunchedEffect(backHandlerRef, draft) {
        backHandlerRef?.value = {
            if (draft != null) {
                optimizeSeq.intValue += 1
                optimizing = false
                draft = null
                editableQuery = ""
                optimizeError = null
                true
            } else false
        }
    }

    LaunchedEffect(keywords, suggestions) {
        val q = keywords.trim()
        if (q.length < 2) {
            placeCheck = null
            placeChecking = false
            return@LaunchedEffect
        }
        if (suggestions.smartPlan != null || suggestions.incompletePlan != null ||
            suggestions.cities.isNotEmpty() || !suggestions.unknownInput
        ) {
            placeCheck = null
            placeChecking = false
            return@LaunchedEffect
        }
        placeChecking = true
        delay(450)
        placeCheck = runCatching {
            ApiClient.trips.validateDestination(ValidateDestinationPayload(q))
        }.getOrNull()
        placeChecking = false
    }

    fun fetchOptimizedQuery(next: SmartPlanDraft) {
        val seq = ++optimizeSeq.intValue
        optimizing = true
        optimizeError = null
        scope.launch(Dispatchers.IO) {
            try {
                val res = ApiClient.chat.optimizePlanQuery(
                    OptimizePlanQueryRequest(
                        keywords = next.keywords,
                        destination = next.destination,
                        days = next.days,
                        startDate = next.startDate,
                        endDate = next.endDate,
                        llm = modelPicker.curModel.toLlmOverride(),
                    ),
                )
                if (seq != optimizeSeq.intValue) return@launch
                withContext(Dispatchers.Main) {
                    editableQuery = res.query.trim()
                    draft = draft?.takeIf { it.keywords == next.keywords }
                        ?.copy(expandedQuery = res.query.trim())
                }
            } catch (e: Exception) {
                if (seq != optimizeSeq.intValue) return@launch
                withContext(Dispatchers.Main) {
                    optimizeError = e.message ?: "AI 优化失败，请手动编辑或重试"
                    editableQuery = buildExpandedQuery(next)
                }
            } finally {
                if (seq == optimizeSeq.intValue) {
                    withContext(Dispatchers.Main) { optimizing = false }
                }
            }
        }
    }

    fun openDraft(next: SmartPlanDraft) {
        draft = next
        editableQuery = ""
        optimizeError = null
        keywords = next.keywords
        fetchOptimizedQuery(next)
    }

    fun startPlan(action: PlanNavigateAction) {
        if (submitting || optimizing) return
        submitting = true
        submitError = null
        scope.launch(Dispatchers.IO) {
            try {
                val payload = GeneratePayload(
                    destination = action.destination,
                    route = action.route,
                    startDate = action.startDate,
                    endDate = action.endDate,
                    travelers = action.travelers ?: 2,
                    preferences = GenPreferences(
                        interests = action.interests,
                        transport = action.transport ?: "公共交通",
                        chatHint = action.chatHint,
                    ),
                    llm = modelPicker.curModel.toLlmOverride(),
                )
                val trip = if (GuestStore.isGuestSync() && TokenStore.getSync() == null) {
                    ApiClient.trips.guestGenerate(payload).also { GuestStore.rememberTrip(it.id) }
                } else {
                    ApiClient.trips.generate(payload)
                }
                withContext(Dispatchers.Main) { onOpenTrip(trip.id) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    submitError = e.message ?: "规划失败，请重试"
                }
            } finally {
                withContext(Dispatchers.Main) { submitting = false }
            }
        }
    }

    if (draft != null) {
        ConfirmStep(
            draft = draft!!,
            editableQuery = editableQuery,
            onEditableQueryChange = { editableQuery = it },
            optimizing = optimizing,
            optimizeError = optimizeError,
            submitError = submitError,
            submitting = submitting,
            modelLabel = modelPicker.curModel.label,
            onOpenModelPicker = { modelPicker.openModelPopup() },
            onEditKeywords = {
                optimizeSeq.intValue += 1
                optimizing = false
                draft = null
                editableQuery = ""
                optimizeError = null
            },
            onRetryOptimize = { fetchOptimizedQuery(draft!!) },
            onConfirm = {
                val d = draft ?: return@ConfirmStep
                val query = (editableQuery.trim().ifBlank { d.expandedQuery.ifBlank { d.keywords } }).trim()
                if (query.isEmpty()) return@ConfirmStep
                val reparsed = detectPlanIntent(query)
                val base = parseSmartPlanKeywords(d.keywords) ?: d
                val action = reparsed ?: base.action.copy(chatHint = query)
                startPlan(action.copy(chatHint = query))
            },
        )
        ModelPickerSheet(modelPicker)
        if (submitting) SubmitOverlay()
        return
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(ZhijingColors.Bg)
            .padding(horizontal = 16.dp),
    ) {
        HeroTitle()
        Text(
            "输入「地名 + 天数/时间」，如：杭州3天、北京明天",
            fontSize = 13.sp,
            color = ZhijingColors.Muted,
            modifier = Modifier.padding(bottom = 12.dp),
        )
        SearchBox(
            keywords = keywords,
            onKeywordsChange = {
                keywords = it
                draft = null
                editableQuery = ""
                optimizeError = null
            },
        )
        if (keywords.trim().isNotEmpty()) {
            Column(
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
            ) {
                suggestions.incompletePlan?.let { inc ->
                    SuggestRow(
                        title = inc.destination,
                        sub = "缺行程时长 · AI 帮你补全后规划",
                        highlighted = true,
                        onClick = { openDraft(inc) },
                    )
                }
                suggestions.smartPlan?.let { sp ->
                    SuggestRow(
                        title = keywords.trim(),
                        sub = "${sp.destination} · ${sp.days} 天 · 开始规划",
                        highlighted = true,
                        onClick = { openDraft(sp) },
                    )
                }
                suggestions.cities.forEach { city ->
                    SuggestRow(
                        title = city,
                        sub = "点击选择 · AI 补全行程",
                        highlighted = false,
                        onClick = {
                            val next = parseSmartPlanKeywords(city)
                                ?: parseSmartPlanKeywords("${city}2天")
                            if (next != null) openDraft(next)
                        },
                    )
                }
                if (suggestions.smartPlan == null && suggestions.incompletePlan == null && suggestions.cities.isEmpty()) {
                    when {
                        placeChecking -> Text(
                            "正在校验地名…",
                            fontSize = 13.sp,
                            color = ZhijingColors.Muted,
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                        placeCheck != null && !placeCheck!!.valid -> InvalidPlaceBox(
                            message = placeCheck!!.message.ifBlank { "未找到「${keywords.trim()}」" },
                            suggestions = placeCheck!!.suggestions,
                            onPick = { keywords = it; placeCheck = null },
                        )
                        suggestions.unknownInput -> Text(
                            "未找到匹配城市，请检查地名或从热门城市中选择",
                            fontSize = 13.sp,
                            color = ZhijingColors.Muted,
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                        else -> Text(
                            "未找到匹配结果，请换个关键词",
                            fontSize = 13.sp,
                            color = ZhijingColors.Muted,
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                    }
                }
                submitError?.let {
                    Text(it, fontSize = 12.sp, color = ZhijingColors.Danger, modifier = Modifier.padding(top = 8.dp))
                }
            }
        } else {
            Spacer(Modifier.weight(1f))
        }
        if (submitting) SubmitOverlay()
    }
    ModelPickerSheet(modelPicker)
}

@Composable
private fun HeroTitle() {
    Text(
        "试试说你「想去哪、几天」\n我来帮你智能规划",
        fontSize = 20.sp,
        fontWeight = FontWeight.Bold,
        color = ZhijingColors.Ink,
        lineHeight = 28.sp,
        modifier = Modifier.padding(top = 8.dp, bottom = 8.dp),
    )
}

@Composable
private fun SearchBox(keywords: String, onKeywordsChange: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp))
            .padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("✦", fontSize = 16.sp, color = ZhijingColors.BrandHot)
        TextField(
            value = keywords,
            onValueChange = onKeywordsChange,
            placeholder = { Text("你想去哪里？", color = ZhijingColors.Muted) },
            modifier = Modifier.weight(1f),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            singleLine = true,
        )
        if (keywords.isNotEmpty()) {
            Box(
                Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(ZhijingColors.BgSurface)
                    .clickable { onKeywordsChange("") }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) { Text("×", fontSize = 16.sp, color = ZhijingColors.Muted) }
        }
    }
    Spacer(Modifier.height(12.dp))
}

@Composable
private fun SuggestRow(title: String, sub: String, highlighted: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (highlighted) ZhijingColors.BrandSoft else ZhijingColors.Card)
            .border(1.dp, if (highlighted) ZhijingColors.Brand.copy(alpha = 0.3f) else ZhijingColors.Line, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Text(sub, fontSize = 12.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(top = 2.dp))
        }
        Text("→", fontSize = 18.sp, color = ZhijingColors.BrandHot)
    }
}

@Composable
private fun InvalidPlaceBox(message: String, suggestions: List<String>, onPick: (String) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(ZhijingColors.BgSurface)
            .padding(12.dp),
    ) {
        Text(message, fontSize = 13.sp, color = ZhijingColors.Ink)
        if (suggestions.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                suggestions.forEach { c ->
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(ZhijingColors.BrandSoft)
                            .clickable { onPick(c) }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) { Text(c, fontSize = 13.sp, color = ZhijingColors.BrandHot) }
                }
            }
        }
    }
}

@Composable
private fun ConfirmStep(
    draft: SmartPlanDraft,
    editableQuery: String,
    onEditableQueryChange: (String) -> Unit,
    optimizing: Boolean,
    optimizeError: String?,
    submitError: String?,
    submitting: Boolean,
    modelLabel: String,
    onOpenModelPicker: () -> Unit,
    onEditKeywords: () -> Unit,
    onRetryOptimize: () -> Unit,
    onConfirm: () -> Unit,
) {
    val planQuery = editableQuery.trim().ifBlank { draft.expandedQuery.ifBlank { draft.keywords } }
    Column(
        Modifier
            .fillMaxSize()
            .background(ZhijingColors.Bg)
            .padding(horizontal = 16.dp),
    ) {
        HeroTitle()
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(ZhijingColors.Card)
                .border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp))
                .padding(14.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "你的输入：${draft.keywords}",
                    fontSize = 13.sp,
                    color = ZhijingColors.Muted,
                    modifier = Modifier.weight(1f).clickable { onEditKeywords() },
                )
                Text(
                    if (optimizing) "优化中…" else "替换",
                    fontSize = 13.sp,
                    color = if (optimizing) ZhijingColors.Muted else ZhijingColors.BrandHot,
                    modifier = Modifier.clickable(enabled = !optimizing) { onRetryOptimize() },
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("规划描述（可修改）", fontSize = 12.sp, color = ZhijingColors.Muted, modifier = Modifier.weight(1f))
                Text(
                    "$modelLabel ▾",
                    fontSize = 12.sp,
                    color = ZhijingColors.BrandHot,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { onOpenModelPicker() },
                )
            }
            if (optimizing) {
                Row(
                    Modifier.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CircularProgressIndicator(Modifier.height(16.dp), strokeWidth = 2.dp, color = ZhijingColors.Brand)
                    Text("AI 正在优化你的描述…", fontSize = 12.sp, color = ZhijingColors.Muted)
                }
            }
            TextField(
                value = editableQuery,
                onValueChange = onEditableQueryChange,
                enabled = !optimizing,
                placeholder = { Text(if (optimizing) "AI 优化中…" else "描述你想怎么玩…", color = ZhijingColors.Muted) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = ZhijingColors.BgSurface,
                    unfocusedContainerColor = ZhijingColors.BgSurface,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )
            optimizeError?.let {
                Text(it, fontSize = 12.sp, color = ZhijingColors.Danger, modifier = Modifier.padding(top = 4.dp))
            }
            submitError?.let {
                Text(it, fontSize = 12.sp, color = ZhijingColors.Danger, modifier = Modifier.padding(top = 4.dp))
            }
            Text(
                "${draft.startDate} → ${draft.endDate} · ${draft.days} 天",
                fontSize = 12.sp,
                color = ZhijingColors.Muted,
                modifier = Modifier.padding(top = 8.dp),
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(
                        if (planQuery.isBlank() || optimizing || submitting) ZhijingColors.Muted else ZhijingColors.Brand,
                    )
                    .clickable(enabled = planQuery.isNotBlank() && !optimizing && !submitting) { onConfirm() }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (submitting) {
                    CircularProgressIndicator(Modifier.height(20.dp), color = Color.White, strokeWidth = 2.dp)
                } else {
                    Text("开始智能规划 →", fontSize = 15.sp, color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SubmitOverlay() {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.25f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = ZhijingColors.Brand)
            Spacer(Modifier.height(12.dp))
            Text("正在为你规划行程…", fontSize = 14.sp, color = Color.White)
        }
    }
}
