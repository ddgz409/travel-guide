package com.travelguide.app.ui.screens.generate

import android.app.DatePickerDialog
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
import com.travelguide.app.data.api.ValidateDestinationPayload
import com.travelguide.app.data.api.ValidateDestinationResult
import com.travelguide.app.data.local.LlmStore
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

private fun todayIso(): String = ISO.format(Date())
private fun plusDaysIso(n: Int): String {
    val c = Calendar.getInstance()
    c.add(Calendar.DAY_OF_YEAR, n)
    return ISO.format(c.time)
}

/** 新建攻略表单（对齐 RN GenerateScreen 核心字段） */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GenerateScreen(
    onBack: () -> Unit,
    onGenerated: (String) -> Unit,
    initialDestination: String? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var destination by remember { mutableStateOf(initialDestination.orEmpty()) }
    var startDate by remember { mutableStateOf(todayIso()) }
    var endDate by remember { mutableStateOf(plusDaysIso(2)) }
    var travelers by remember { mutableStateOf(2) }
    var selected by remember { mutableStateOf(listOf("文化", "美食")) }
    var budget by remember { mutableStateOf("中等") }
    var transport by remember { mutableStateOf("公共交通") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var destCheck by remember { mutableStateOf<ValidateDestinationResult?>(null) }

    // 目的地校验防抖（450ms，对齐 RN）
    LaunchedEffect(destination) {
        val dest = destination.trim()
        if (dest.length < 2) {
            destCheck = null
            return@LaunchedEffect
        }
        delay(450)
        destCheck = runCatching {
            ApiClient.trips.validateDestination(ValidateDestinationPayload(dest))
        }.getOrNull()
    }

    val daysCount = runCatching {
        ((ISO.parse(endDate)!!.time - ISO.parse(startDate)!!.time) / 86400000).toInt() + 1
    }.getOrDefault(0)

    fun pickDate(initial: String, onPick: (String) -> Unit) {
        val cal = runCatching { ISO.parse(initial) }.getOrNull()
            ?.let { Calendar.getInstance().apply { time = it } }
            ?: Calendar.getInstance()
        DatePickerDialog(
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

    fun submit() {
        val dest = destination.trim()
        when {
            dest.length < 2 -> error = "请输入目的地"
            daysCount <= 0 -> error = "结束日期不能早于开始日期"
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
                        val trip = ApiClient.trips.generate(
                            GeneratePayload(
                                destination = check?.resolvedName ?: dest,
                                startDate = startDate,
                                endDate = endDate,
                                travelers = travelers,
                                preferences = GenPreferences(
                                    interests = selected.ifEmpty { listOf("文化", "美食") },
                                    budgetLevel = budget,
                                    transport = transport,
                                ),
                                llm = LlmStore.localLlmOverride(),
                            ),
                        )
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

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        // 顶栏
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "‹",
                fontSize = 26.sp,
                color = ZhijingColors.Ink,
                modifier = Modifier.clickable { onBack() }.padding(8.dp),
            )
            Text("生成攻略", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        }

        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            // 目的地
            Text("目的地", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            TextField(
                value = destination,
                onValueChange = { destination = it },
                placeholder = { Text("想去哪？城市或路线，如「青甘环线」", color = ZhijingColors.Muted) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = ZhijingColors.Card,
                    unfocusedContainerColor = ZhijingColors.Card,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                singleLine = true,
            )
            destCheck?.let { c ->
                Spacer(Modifier.height(4.dp))
                Text(
                    if (c.valid) "✓ ${c.resolvedName ?: destination.trim()}" else c.message.ifBlank { "目的地可能不存在" },
                    fontSize = 12.sp,
                    color = if (c.valid) ZhijingColors.Ready else ZhijingColors.Danger,
                )
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                QUICK_CITIES.forEach { city ->
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(ZhijingColors.BrandSoft)
                            .clickable { destination = city }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) { Text(city, fontSize = 13.sp, color = ZhijingColors.BrandHot) }
                }
            }

            Spacer(Modifier.height(18.dp))

            // 日期
            Text("日期", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("出发" to startDate to { d: String -> startDate = d }, "返程" to endDate to { d: String -> endDate = d }).forEach { (pair, set) ->
                    Box(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(14.dp))
                            .border(1.dp, ZhijingColors.Line, RoundedCornerShape(14.dp))
                            .background(ZhijingColors.Card)
                            .clickable { pickDate(pair.second) { set(it) } }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${pair.first} ${pair.second}", fontSize = 14.sp, color = ZhijingColors.Ink)
                    }
                }
            }
            if (daysCount > 0) {
                Spacer(Modifier.height(4.dp))
                Text("共 $daysCount 天", fontSize = 12.sp, color = ZhijingColors.Muted)
            }

            Spacer(Modifier.height(18.dp))

            // 人数
            Text("出行人数", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(
                    Modifier.size(36.dp).clip(RoundedCornerShape(18.dp))
                        .border(1.dp, ZhijingColors.Line, RoundedCornerShape(18.dp))
                        .clickable { travelers = (travelers - 1).coerceAtLeast(1) },
                    contentAlignment = Alignment.Center,
                ) { Text("−", fontSize = 18.sp, color = ZhijingColors.Ink) }
                Text("$travelers 人", fontSize = 15.sp, color = ZhijingColors.Ink)
                Box(
                    Modifier.size(36.dp).clip(RoundedCornerShape(18.dp))
                        .border(1.dp, ZhijingColors.Line, RoundedCornerShape(18.dp))
                        .clickable { travelers = (travelers + 1).coerceAtMost(20) },
                    contentAlignment = Alignment.Center,
                ) { Text("＋", fontSize = 18.sp, color = ZhijingColors.Ink) }
            }

            Spacer(Modifier.height(18.dp))

            // 兴趣
            Text("兴趣偏好（可多选）", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                INTERESTS.forEach { tag ->
                    val on = selected.contains(tag)
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (on) ZhijingColors.Brand else ZhijingColors.Card)
                            .then(
                                if (on) Modifier else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp)),
                            )
                            .clickable {
                                selected = if (on) selected - tag else selected + tag
                            }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(tag, fontSize = 13.sp, color = if (on) Color.White else ZhijingColors.Ink)
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            // 预算
            Text("预算档位", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BUDGETS.forEach { (id, desc) ->
                    val on = budget == id
                    Column(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (on) ZhijingColors.BrandSoft else ZhijingColors.Card)
                            .then(
                                if (on) Modifier.border(1.dp, ZhijingColors.BrandHot, RoundedCornerShape(14.dp))
                                else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(14.dp)),
                            )
                            .clickable { budget = id }
                            .padding(vertical = 10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(id, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (on) ZhijingColors.BrandHot else ZhijingColors.Ink)
                        Text(desc, fontSize = 11.sp, color = ZhijingColors.Muted)
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            // 交通
            Text("交通方式", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TRANSPORTS.forEach { t ->
                    val on = transport == t
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (on) ZhijingColors.Brand else ZhijingColors.Card)
                            .then(
                                if (on) Modifier else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp)),
                            )
                            .clickable { transport = t }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(t, fontSize = 13.sp, color = if (on) Color.White else ZhijingColors.Ink)
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }

        // 提交
        error?.let {
            Text(
                it,
                fontSize = 13.sp,
                color = ZhijingColors.Danger,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 10.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(if (busy) ZhijingColors.Muted else ZhijingColors.Brand)
                .clickable(enabled = !busy) { submit() }
                .padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (busy) "提交中…" else "生成攻略",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}
