package com.travelguide.app.ui.screens.generate

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.GeneratePayload
import com.travelguide.app.data.api.GenPreferences
import com.travelguide.app.data.api.QuickRecommendPayload
import com.travelguide.app.data.api.ValidateDestinationPayload
import com.travelguide.app.data.api.ValidateDestinationResult
import com.travelguide.app.data.local.GuestStore
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.local.toLlmOverride
import com.travelguide.app.ui.components.ModelPickerSheet
import com.travelguide.app.ui.components.rememberModelPicker
import com.travelguide.app.data.model.ExternalTip
import com.travelguide.app.data.model.QuickRecommendCard
import com.travelguide.app.ui.theme.ZhijingColors
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val ISO = SimpleDateFormat("yyyy-MM-dd", Locale.US)

private val INTERESTS = listOf("文化", "美食", "自然", "购物", "亲子", "摄影", "历史", "艺术")
private val BUDGETS = listOf("经济" to "性价比优先", "中等" to "舒适平衡", "豪华" to "体验优先")
private val TRANSPORTS = listOf("公共交通", "自驾", "步行", "混合")
private val QUICK_CITIES = listOf("北京", "成都", "杭州", "大理", "西安", "厦门", "上海", "三亚")
private val MODE_QUICK_BG = Color(0xFFFFE8D6)
private val MODE_CUSTOM_BG = Color(0xFFE8E4F8)
private val QUICK_CARD_BG = mapOf("classic" to Color(0xFFE8E4F8), "life" to Color(0xFFFFE8D6))
private val QUICK_CARD_FALLBACK = listOf(Color(0xFFD7EAF8), Color(0xFFE4F0D8), Color(0xFFF5E0EC))

private enum class GenMode { QUICK, CUSTOM }

private fun todayIso(): String = ISO.format(Date())
private fun plusDaysIso(n: Int): String {
    val c = Calendar.getInstance()
    c.add(Calendar.DAY_OF_YEAR, n)
    return ISO.format(c.time)
}

private fun quickCardBg(cardId: String, index: Int): Color =
    QUICK_CARD_BG[cardId] ?: QUICK_CARD_FALLBACK[index % QUICK_CARD_FALLBACK.size]

/** 生成攻略（对齐 RN GenerateScreen：快速模式 + 专属定制） */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GenerateScreen(
    onBack: () -> Unit,
    onGenerated: (String) -> Unit,
    onOpenSettings: () -> Unit = {},
    initialDestination: String? = null,
    mode: String? = null,
    autoSubmit: Boolean = false,
    chatHint: String? = null,
    startDateParam: String? = null,
    endDateParam: String? = null,
    initialInterests: List<String>? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val modelPicker = rememberModelPicker(onOpenSettings)

    var genMode by remember { mutableStateOf(if (mode == "custom") GenMode.CUSTOM else GenMode.QUICK) }
    var destination by remember { mutableStateOf(initialDestination.orEmpty()) }
    var startDate by remember { mutableStateOf(todayIso()) }
    var endDate by remember { mutableStateOf(plusDaysIso(2)) }
    var travelers by remember { mutableStateOf(2) }
    var selected by remember { mutableStateOf(listOf("文化", "美食")) }
    var budget by remember { mutableStateOf("中等") }
    var transport by remember { mutableStateOf("公共交通") }
    var chatHintState by remember { mutableStateOf(chatHint.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var destCheck by remember { mutableStateOf<ValidateDestinationResult?>(null) }
    var destChecking by remember { mutableStateOf(false) }
    var quickCards by remember { mutableStateOf(emptyList<QuickRecommendCard>()) }
    var autoSubmitted by remember { mutableStateOf(false) }

    LaunchedEffect(initialDestination, initialInterests, startDateParam, endDateParam) {
        initialDestination?.takeIf { it.isNotBlank() }?.let { destination = it }
        initialInterests?.takeIf { it.isNotEmpty() }?.let { selected = it }
        startDateParam?.let { startDate = it }
        endDateParam?.let { endDate = it }
    }

    LaunchedEffect(destination) {
        val dest = destination.trim()
        if (dest.length < 2) {
            destCheck = null
            destChecking = false
            return@LaunchedEffect
        }
        destChecking = true
        delay(450)
        destCheck = runCatching {
            ApiClient.trips.validateDestination(ValidateDestinationPayload(dest))
        }.getOrNull()
        destChecking = false
    }

    val daysCount = runCatching {
        ((ISO.parse(endDate)!!.time - ISO.parse(startDate)!!.time) / 86400000).toInt() + 1
    }.getOrDefault(0)

    fun pickDate(initial: String, onPick: (String) -> Unit) {
        val cal = runCatching { ISO.parse(initial) }.getOrNull()
            ?.let { Calendar.getInstance().apply { time = it } }
            ?: Calendar.getInstance()
        android.app.DatePickerDialog(
            context,
            { _, y, m, d ->
                val c = Calendar.getInstance()
                c.set(y, m, d)
                onPick(ISO.format(c.time))
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH),
        ).show()
    }

    fun onQuickRecommend() {
        val dest = destination.trim()
        if (dest.length < 2) {
            error = "请输入目的地"
            return
        }
        busy = true
        error = null
        quickCards = emptyList()
        scope.launch {
            runCatching {
                ApiClient.trips.quickRecommend(QuickRecommendPayload(dest))
            }.fold(
                onSuccess = { quickCards = it.cards },
                onFailure = { error = it.message ?: "获取推荐失败" },
            )
            busy = false
        }
    }

    fun submitInternal(
        destInput: String,
        start: String,
        end: String,
        interestList: List<String>,
        hint: String?,
    ) {
        val dest = destInput.trim()
        when {
            dest.length < 2 -> error = "请输入目的地"
            runCatching {
                ((ISO.parse(end)!!.time - ISO.parse(start)!!.time) / 86400000).toInt() + 1
            }.getOrDefault(0) <= 0 -> error = "结束日期不能早于开始日期"
            else -> {
                error = null
                busy = true
                scope.launch(Dispatchers.IO) {
                    try {
                        val check = runCatching {
                            ApiClient.trips.validateDestination(ValidateDestinationPayload(dest))
                        }.getOrNull()
                        if (check != null && !check.valid) {
                            withContext(Dispatchers.Main) {
                                error = check.message.ifBlank { "未找到「$dest」" }
                            }
                            return@launch
                        }
                        val payload = GeneratePayload(
                            destination = check?.resolvedName ?: dest,
                            startDate = start,
                            endDate = end,
                            travelers = travelers,
                            preferences = GenPreferences(
                                interests = interestList.ifEmpty { listOf("文化", "美食") },
                                budgetLevel = budget,
                                transport = transport,
                                chatHint = hint?.takeIf { it.isNotBlank() },
                            ),
                            llm = modelPicker.curModel.toLlmOverride(),
                        )
                        val trip = if (GuestStore.isGuestSync() && TokenStore.getSync() == null) {
                            ApiClient.trips.guestGenerate(payload).also { GuestStore.rememberTrip(it.id) }
                        } else {
                            ApiClient.trips.generate(payload)
                        }
                        withContext(Dispatchers.Main) { onGenerated(trip.id) }
                    } catch (e: Exception) {
                        withContext(Dispatchers.Main) { error = e.message ?: "生成失败，请重试" }
                    } finally {
                        withContext(Dispatchers.Main) { busy = false }
                    }
                }
            }
        }
    }

    fun submit() = submitInternal(destination, startDate, endDate, selected, chatHintState.takeIf { it.isNotBlank() })

    LaunchedEffect(autoSubmit, initialDestination, startDateParam, endDateParam, autoSubmitted) {
        if (!autoSubmit || autoSubmitted) return@LaunchedEffect
        val dest = initialDestination?.trim().orEmpty()
        val start = startDateParam ?: startDate
        val end = endDateParam ?: endDate
        if (dest.length < 2 || start.isBlank() || end.isBlank()) return@LaunchedEffect
        autoSubmitted = true
        genMode = GenMode.CUSTOM
        submitInternal(dest, start, end, initialInterests ?: selected, chatHint)
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("‹", fontSize = 26.sp, color = ZhijingColors.Ink, modifier = Modifier.clickable { onBack() }.padding(8.dp))
            Text("生成攻略", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        }

        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            Text("选择模式", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ModeCard(
                    title = "快速模式",
                    desc = "秒出小红书 / 携程参考链接",
                    bg = MODE_QUICK_BG,
                    selected = genMode == GenMode.QUICK,
                    modifier = Modifier.weight(1f),
                    onClick = { genMode = GenMode.QUICK; error = null },
                )
                ModeCard(
                    title = "专属定制",
                    desc = "AI 生成每日行程与路线",
                    bg = MODE_CUSTOM_BG,
                    selected = genMode == GenMode.CUSTOM,
                    modifier = Modifier.weight(1f),
                    onClick = { genMode = GenMode.CUSTOM; error = null },
                )
            }

            Spacer(Modifier.height(18.dp))
            Text("目的地", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            TextField(
                value = destination,
                onValueChange = {
                    destination = it
                    quickCards = emptyList()
                    error = null
                },
                placeholder = { Text("例如：杭州", color = ZhijingColors.Muted) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = textFieldColors(),
                singleLine = true,
            )
            when {
                destChecking -> Text("正在校验地名…", fontSize = 12.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(top = 4.dp))
                destCheck != null && !destCheck!!.valid -> {
                    Text(destCheck!!.message.ifBlank { "目的地可能不存在" }, fontSize = 12.sp, color = ZhijingColors.Danger, modifier = Modifier.padding(top = 4.dp))
                    if (destCheck!!.suggestions.isNotEmpty()) {
                        FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            destCheck!!.suggestions.forEach { c ->
                                SuggestChip(c) { destination = c; error = null }
                            }
                        }
                    }
                }
                destCheck?.valid == true && !destCheck!!.resolvedName.isNullOrBlank() &&
                    destCheck!!.resolvedName != destination.trim() ->
                    Text("将按「${destCheck!!.resolvedName}」生成攻略", fontSize = 12.sp, color = ZhijingColors.Ready, modifier = Modifier.padding(top = 4.dp))
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                QUICK_CITIES.forEach { city ->
                    SuggestChip(city, selected = destination == city) {
                        destination = city
                        quickCards = emptyList()
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            when (genMode) {
                GenMode.QUICK -> QuickModePane(
                    error = error,
                    busy = busy,
                    cards = quickCards,
                    onRecommend = ::onQuickRecommend,
                )
                GenMode.CUSTOM -> CustomModePane(
                    modelLabel = modelPicker.curModel.label,
                    onOpenModelPicker = { modelPicker.openModelPopup() },
                    onOpenSettings = onOpenSettings,
                    startDate = startDate,
                    endDate = endDate,
                    daysCount = daysCount,
                    travelers = travelers,
                    selected = selected,
                    budget = budget,
                    transport = transport,
                    onPickStart = { pickDate(startDate) { startDate = it } },
                    onPickEnd = { pickDate(endDate) { endDate = it } },
                    onTravelersMinus = { travelers = (travelers - 1).coerceAtLeast(1) },
                    onTravelersPlus = { travelers = (travelers + 1).coerceAtMost(20) },
                    onToggleInterest = { tag ->
                        selected = if (selected.contains(tag)) selected - tag else selected + tag
                    },
                    onBudget = { budget = it },
                    onTransport = { transport = it },
                )
            }
            Spacer(Modifier.height(24.dp))
        }

        if (genMode == GenMode.CUSTOM) {
            error?.let {
                Text(it, fontSize = 13.sp, color = ZhijingColors.Danger, modifier = Modifier.padding(horizontal = 20.dp))
            }
            PrimaryButton(if (busy) "提交中…" else "生成攻略", busy) { submit() }
        }
    }
    ModelPickerSheet(modelPicker)
}

@Composable
private fun ModeCard(title: String, desc: String, bg: Color, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bg)
            .then(if (selected) Modifier.border(2.dp, ZhijingColors.BrandHot, RoundedCornerShape(16.dp)) else Modifier)
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Column {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = if (selected) ZhijingColors.BrandHot else ZhijingColors.Ink)
            Text(desc, fontSize = 11.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun SuggestChip(label: String, selected: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (selected) ZhijingColors.Brand else ZhijingColors.BrandSoft)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(label, fontSize = 13.sp, color = if (selected) Color.White else ZhijingColors.BrandHot)
    }
}

@Composable
private fun QuickModePane(
    error: String?,
    busy: Boolean,
    cards: List<QuickRecommendCard>,
    onRecommend: () -> Unit,
) {
    val context = LocalContext.current
    Text("不调用模型，立刻给你两套可打开的攻略入口。", fontSize = 13.sp, color = ZhijingColors.Muted)
    error?.let { Text(it, fontSize = 13.sp, color = ZhijingColors.Danger, modifier = Modifier.padding(top = 8.dp)) }
    Spacer(Modifier.height(12.dp))
    PrimaryButton(if (busy) "加载中…" else "查看参考", busy, onRecommend)
    cards.forEachIndexed { i, card ->
        Spacer(Modifier.height(14.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(quickCardBg(card.id, i))
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(RoundedCornerShape(4.dp)).background(ZhijingColors.BrandHot))
                Spacer(Modifier.width(8.dp))
                Text(if (card.id == "life") "吃住出行" else "经典打卡", fontSize = 12.sp, color = ZhijingColors.Muted)
            }
            Text(card.title, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
            if (card.tagline.isNotBlank()) {
                Text(card.tagline, fontSize = 13.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(top = 4.dp))
            }
            TipList("小红书", card.externalRefs.xiaohongshu) { url ->
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    .onFailure { Toast.makeText(context, "无法打开链接", Toast.LENGTH_SHORT).show() }
            }
            TipList("携程", card.externalRefs.ctrip) { url ->
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    .onFailure { Toast.makeText(context, "无法打开链接", Toast.LENGTH_SHORT).show() }
            }
        }
    }
}

@Composable
private fun TipList(title: String, tips: List<ExternalTip>, onOpen: (String) -> Unit) {
    if (tips.isEmpty()) return
    Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
    tips.forEach { tip ->
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.55f))
                .clickable { onOpen(tip.url) }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(tip.title, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text("打开 →", fontSize = 13.sp, color = ZhijingColors.BrandHot)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CustomModePane(
    modelLabel: String,
    onOpenModelPicker: () -> Unit,
    onOpenSettings: () -> Unit,
    startDate: String,
    endDate: String,
    daysCount: Int,
    travelers: Int,
    selected: List<String>,
    budget: String,
    transport: String,
    onPickStart: () -> Unit,
    onPickEnd: () -> Unit,
    onTravelersMinus: () -> Unit,
    onTravelersPlus: () -> Unit,
    onToggleInterest: (String) -> Unit,
    onBudget: (String) -> Unit,
    onTransport: (String) -> Unit,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(ZhijingColors.BgSurface)
            .clickable(onClick = onOpenSettings)
            .padding(12.dp),
    ) {
        Text("可在设置中添加自定义供应商；未配 Key 时用服务器默认。去管理模型 →", fontSize = 12.sp, color = ZhijingColors.Muted)
    }
    Spacer(Modifier.height(12.dp))
    Text("生成模型", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 6.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(ZhijingColors.Card)
            .clickable(onClick = onOpenModelPicker)
            .padding(14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(modelLabel, fontSize = 14.sp)
        Text("点击切换 ›", fontSize = 13.sp, color = ZhijingColors.Muted)
    }

    Spacer(Modifier.height(16.dp))
    DateRow("开始日期", startDate, onPickStart)
    Spacer(Modifier.height(10.dp))
    DateRow("结束日期", endDate, onPickEnd)
    if (daysCount > 0) Text("$daysCount 天行程", fontSize = 12.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(top = 4.dp))

    Spacer(Modifier.height(16.dp))
    Text("出行人数", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        CounterBtn("−", onTravelersMinus)
        Text("$travelers 人", fontSize = 15.sp)
        CounterBtn("＋", onTravelersPlus)
    }

    Spacer(Modifier.height(16.dp))
    Text("兴趣偏好", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        INTERESTS.forEach { tag -> InterestChip(tag, selected.contains(tag)) { onToggleInterest(tag) } }
    }

    Spacer(Modifier.height(16.dp))
    Text("预算档位", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        BUDGETS.forEach { (id, desc) ->
            val on = budget == id
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (on) ZhijingColors.BrandSoft else ZhijingColors.Card)
                    .then(if (on) Modifier.border(1.dp, ZhijingColors.BrandHot, RoundedCornerShape(14.dp)) else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(14.dp)))
                    .clickable { onBudget(id) }
                    .padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(id, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (on) ZhijingColors.BrandHot else ZhijingColors.Ink)
                Text(desc, fontSize = 11.sp, color = ZhijingColors.Muted)
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    Text("交通方式", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TRANSPORTS.forEach { t -> InterestChip(t, transport == t) { onTransport(t) } }
    }
}

@Composable
private fun DateRow(label: String, value: String, onClick: () -> Unit) {
    Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    Box(
        Modifier
            .fillMaxWidth()
            .padding(top = 6.dp)
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, ZhijingColors.Line, RoundedCornerShape(14.dp))
            .background(ZhijingColors.Card)
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(value, fontSize = 14.sp)
            Text("日历选择", fontSize = 12.sp, color = ZhijingColors.Muted)
        }
    }
}

@Composable
private fun CounterBtn(label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, ZhijingColors.Line, RoundedCornerShape(18.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, fontSize = 18.sp) }
}

@Composable
private fun InterestChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (selected) ZhijingColors.Brand else ZhijingColors.Card)
            .then(if (selected) Modifier else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp)))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        Text(label, fontSize = 13.sp, color = if (selected) Color.White else ZhijingColors.Ink)
    }
}

@Composable
private fun PrimaryButton(label: String, busy: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 10.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(if (busy) ZhijingColors.Muted else ZhijingColors.Brand)
            .clickable(enabled = !busy, onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (busy && label.contains("加载")) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
        } else {
            Text(label, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}

@Composable
private fun textFieldColors() = TextFieldDefaults.colors(
    focusedContainerColor = ZhijingColors.Card,
    unfocusedContainerColor = ZhijingColors.Card,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
)
