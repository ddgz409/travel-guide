package com.travelguide.app.ui.screens.chat

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.api.ChatMessageDto
import com.travelguide.app.data.api.ChatStreamRequest
import com.travelguide.app.data.api.ErrorBody
import com.travelguide.app.data.api.GeneratePayload
import com.travelguide.app.data.api.GenPreferences
import com.travelguide.app.data.local.LlmStore
import com.travelguide.app.ui.theme.ZhijingColors
import java.io.IOException
import java.net.SocketTimeoutException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private const val WELCOME = """你好！我是「知径」AI 旅行助手 🌍

我可以帮你推荐目的地、景点美食、规划行程、回答签证天气等旅行问题。

直接输入你的需求，或点下面的快捷提问。"""

private val QUICK = listOf(
    "🍜 杭州美食" to "杭州有什么必吃的美食和餐厅？",
    "📋 北京行程" to "帮我规划明天去北京的旅游行程，并建议穿衣搭配",
    "✈️ 三亚亲子" to "带3岁孩子去三亚，推荐适合亲子的酒店和景点",
    "🌸 日本樱花" to "明年春天想去日本看樱花，什么时候去最好？",
)

// ---------- 消息模型 ----------

data class ChoiceOption(val label: String, val send: String)

sealed interface ChatWidget {
    data class Choices(val style: String, val options: List<ChoiceOption>) : ChatWidget
    data class DatePicker(val destination: String, val suggestDays: Int) : ChatWidget
    data class PlanResult(val action: JsonObject) : ChatWidget
}

data class ChatMsg(
    val role: String,
    val content: String = "",
    val reasoning: String = "",
    val widget: ChatWidget? = null,
)

@Serializable
private data class SseEvent(
    val type: String = "",
    val content: String = "",
    val tool: String? = null,
    val result: String? = null,
    val payload: JsonObject? = null,
)

private sealed interface DialogState {
    data class OpenTrip(val title: String, val tripId: String) : DialogState
    data class DeleteTrip(val tripId: String, val title: String, val meta: String) : DialogState
    data class PlanConfirm(val action: JsonObject) : DialogState
    data class TripList(val trips: List<JsonObject>) : DialogState
}

private fun iso(cal: Calendar): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)

// ---------- 主屏 ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChatScreen(
    tripId: String?,
    onBack: () -> Unit,
    onOpenTrip: (String) -> Unit,
) {
    var msgs by remember { mutableStateOf(listOf(ChatMsg("assistant", WELCOME))) }
    var input by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var planBusy by remember { mutableStateOf(false) }
    var dialog by remember { mutableStateOf<DialogState?>(null) }

    val scope = rememberCoroutineScope()
    val callRef = remember { mutableStateOf<retrofit2.Call<okhttp3.ResponseBody>?>(null) }
    val listState = rememberLazyListState()

    fun pushAssistant(text: String) {
        msgs = msgs + ChatMsg("assistant", text)
    }

    fun updateLast(content: String, reasoning: String, widget: ChatWidget?) {
        msgs = msgs.dropLast(1) + ChatMsg("assistant", content, reasoning, widget)
    }

    // 新消息/流式更新时滚到底部
    LaunchedEffect(msgs.size, msgs.lastOrNull()?.content?.length ?: 0) {
        listState.scrollToItem(msgs.size - 1)
    }

    fun send(raw: String) {
        val text = raw.trim()
        if (text.isEmpty() || loading) return
        input = ""
        val history = msgs + ChatMsg("user", text)
        msgs = history + ChatMsg("assistant")
        loading = true

        scope.launch(Dispatchers.IO) {
            val call = ApiClient.chat.stream(
                ChatStreamRequest(
                    messages = history.map { ChatMessageDto(it.role, it.content) },
                    tripId = tripId,
                    llm = LlmStore.localLlmOverride(),
                ),
            )
            callRef.value = call
            var aiContent = ""
            var aiReasoning = ""
            var aiWidget: ChatWidget? = null
            try {
                val resp = call.execute()
                if (!resp.isSuccessful) {
                    val detail = runCatching {
                        AppJson.decodeFromString<ErrorBody>(resp.errorBody()?.string().orEmpty()).detail
                    }.getOrNull() ?: "请求失败（${resp.code()}）"
                    updateLast("❌ $detail", "", null)
                    return@launch
                }
                val source = resp.body()!!.source()
                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    if (!line.startsWith("data: ")) continue
                    val data = line.removePrefix("data: ").trim()
                    if (data == "[DONE]") break
                    val ev = runCatching { AppJson.decodeFromString<SseEvent>(data) }.getOrNull() ?: continue
                    when (ev.type) {
                        "content", "error" -> aiContent += ev.content
                        "reasoning" -> aiReasoning += ev.content
                        "action" -> {
                            val p = ev.payload
                            when (p?.get("action")?.jsonPrimitive?.contentOrNull) {
                                "navigate_generate" -> aiWidget = ChatWidget.PlanResult(p)
                                "show_choices" -> aiWidget = ChatWidget.Choices(
                                    if (p["style"]?.jsonPrimitive?.contentOrNull == "select_list") "select_list" else "chips",
                                    p["options"]?.jsonArray?.mapNotNull { o ->
                                        val obj = o.jsonObject
                                        val label = obj["label"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                                        ChoiceOption(label, obj["send"]?.jsonPrimitive?.contentOrNull ?: label)
                                    } ?: emptyList(),
                                )
                                "show_date_picker" -> aiWidget = ChatWidget.DatePicker(
                                    p["destination"]?.jsonPrimitive?.contentOrNull ?: "",
                                    p["suggest_days"]?.jsonPrimitive?.intOrNull ?: 3,
                                )
                                "open_trip" -> withContext(Dispatchers.Main) {
                                    dialog = DialogState.OpenTrip(
                                        p["title"]?.jsonPrimitive?.contentOrNull ?: "该攻略",
                                        p["trip_id"]?.jsonPrimitive?.contentOrNull ?: "",
                                    )
                                }
                                "show_trip_list" -> withContext(Dispatchers.Main) {
                                    dialog = DialogState.TripList(
                                        p["trips"]?.jsonArray?.map { it.jsonObject } ?: emptyList(),
                                    )
                                }
                                "open_share", "open_collection_editor" ->
                                    aiContent += "\n🚧 该功能将在后续版本提供。"
                                else -> {}
                            }
                        }
                        "tool_result" -> if (ev.tool == "list_trips") {
                            val arr = runCatching {
                                AppJson.parseToJsonElement(ev.result.orEmpty()).jsonObject["trips"]?.jsonArray
                            }.getOrNull()
                            if (arr != null) withContext(Dispatchers.Main) {
                                dialog = DialogState.TripList(arr.map { it.jsonObject })
                            }
                        }
                        "confirmation_required" -> {
                            val p = ev.payload
                            if (p?.get("tool")?.jsonPrimitive?.contentOrNull == "delete_trip") {
                                withContext(Dispatchers.Main) {
                                    dialog = DialogState.DeleteTrip(
                                        p["trip_id"]?.jsonPrimitive?.contentOrNull ?: "",
                                        p["title"]?.jsonPrimitive?.contentOrNull ?: "该攻略",
                                        p["destination"]?.jsonPrimitive?.contentOrNull ?: "",
                                    )
                                }
                            }
                        }
                    }
                    updateLast(aiContent, aiReasoning, aiWidget)
                }
                // 流结束：清掉从未写入内容的空气泡
                if (msgs.lastOrNull()?.let { it.role == "assistant" && it.content.isBlank() && it.widget == null } == true) {
                    msgs = msgs.dropLast(1)
                }
            } catch (e: SocketTimeoutException) {
                updateLast("⏱️ AI 长时间没有响应，已自动断开。请重试。", aiReasoning, aiWidget)
            } catch (e: IOException) {
                if (!call.isCanceled) updateLast("❌ 网络异常，请重试", aiReasoning, aiWidget)
            } catch (e: Exception) {
                updateLast("❌ ${e.message ?: "请求失败"}", aiReasoning, aiWidget)
            } finally {
                callRef.value = null
                withContext(Dispatchers.Main) { loading = false }
            }
        }
    }

    fun stop() {
        callRef.value?.cancel()
        loading = false
    }

    fun startPlan(action: JsonObject) {
        planBusy = true
        scope.launch(Dispatchers.IO) {
            try {
                val tomorrow = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 1) }
                val defaultEnd = (tomorrow.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 2) }
                val payload = GeneratePayload(
                    destination = action["destination"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    route = action["route"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }?.takeIf { it.isNotEmpty() },
                    startDate = action["start_date"]?.jsonPrimitive?.contentOrNull ?: iso(tomorrow),
                    endDate = action["end_date"]?.jsonPrimitive?.contentOrNull ?: iso(defaultEnd),
                    travelers = action["travelers"]?.jsonPrimitive?.intOrNull ?: 2,
                    preferences = GenPreferences(
                        interests = action["interests"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }?.takeIf { it.isNotEmpty() } ?: listOf("文化", "美食"),
                        transport = action["transport"]?.jsonPrimitive?.contentOrNull ?: "公共交通",
                        chatHint = action["chat_hint"]?.jsonPrimitive?.contentOrNull,
                    ),
                    llm = LlmStore.localLlmOverride(),
                )
                val trip = ApiClient.trips.generate(payload)
                withContext(Dispatchers.Main) { onOpenTrip(trip.id) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { pushAssistant("❌ ${e.message ?: "规划失败，请重试"}") }
            } finally {
                withContext(Dispatchers.Main) { planBusy = false }
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
            Text("AI 助手", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
            if (tripId != null) {
                Text(
                    "结合当前攻略",
                    fontSize = 12.sp,
                    color = ZhijingColors.BrandHot,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }

        // 消息列表
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(msgs) { i, m ->
                Bubble(
                    msg = m,
                    loading = loading && i == msgs.size - 1,
                    onSend = ::send,
                    onPlanConfirm = { dialog = DialogState.PlanConfirm(it) },
                    planBusy = planBusy,
                )
            }
        }

        // 快捷提问（仅初始）
        if (msgs.size <= 1) {
            FlowRow(
                Modifier.padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                QUICK.forEach { (label, text) ->
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(ZhijingColors.BrandSoft)
                            .clickable { send(text) }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Text(label, fontSize = 13.sp, color = ZhijingColors.BrandHot)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        // 输入栏
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("输入你的旅行问题…", color = ZhijingColors.Muted) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(24.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = ZhijingColors.Card,
                    unfocusedContainerColor = ZhijingColors.Card,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                maxLines = 4,
            )
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(23.dp))
                    .background(if (loading) ZhijingColors.Muted else ZhijingColors.Brand)
                    .clickable { if (loading) stop() else send(input) },
                contentAlignment = Alignment.Center,
            ) {
                if (loading) {
                    Text("■", color = Color.White, fontSize = 16.sp)
                } else {
                    Text("➤", color = Color.White, fontSize = 18.sp)
                }
            }
        }
    }

    // ---------- 弹窗 ----------
    when (val d = dialog) {
        is DialogState.OpenTrip -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("确认跳转") },
            text = { Text("是否打开攻略「${d.title}」？") },
            confirmButton = {
                TextButton(onClick = { dialog = null; onOpenTrip(d.tripId) }) { Text("打开") }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("取消") } },
        )
        is DialogState.DeleteTrip -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("确认删除行程") },
            text = { Text("确定删除「${d.title}」吗？${if (d.meta.isNotBlank()) "\n${d.meta}" else ""}\n\n此操作不可恢复。") },
            confirmButton = {
                TextButton(onClick = {
                    dialog = null
                    scope.launch(Dispatchers.IO) {
                        val ok = runCatching { ApiClient.trips.remove(d.tripId) }.isSuccess
                        withContext(Dispatchers.Main) {
                            pushAssistant(if (ok) "✅ 已删除行程「${d.title}」。" else "❌ 删除失败，请重试")
                        }
                    }
                }) { Text("删除", color = ZhijingColors.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { dialog = null; pushAssistant("🚫 已取消删除。") }) { Text("取消") }
            },
        )
        is DialogState.PlanConfirm -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("确认") },
            text = { Text("是否生成并打开该攻略？") },
            confirmButton = {
                TextButton(onClick = { dialog = null; startPlan(d.action) }) { Text("生成并打开") }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("取消") } },
        )
        is DialogState.TripList -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("我的攻略") },
            text = {
                Column {
                    d.trips.forEach { t ->
                        Text(
                            t["title"]?.jsonPrimitive?.contentOrNull ?: "未命名攻略",
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    dialog = null
                                    t["id"]?.jsonPrimitive?.contentOrNull?.let(onOpenTrip)
                                }
                                .padding(vertical = 8.dp),
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { dialog = null }) { Text("关闭") } },
        )
        null -> {}
    }
}

// ---------- 气泡 ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Bubble(
    msg: ChatMsg,
    loading: Boolean,
    onSend: (String) -> Unit,
    onPlanConfirm: (JsonObject) -> Unit,
    planBusy: Boolean,
) {
    val isUser = msg.role == "user"
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            Modifier
                .weight(1f, fill = false)
                .clip(
                    RoundedCornerShape(
                        topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp,
                    ),
                )
                .background(if (isUser) ZhijingColors.Brand else ZhijingColors.Card)
                .then(
                    if (isUser) Modifier else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp)),
                )
                .padding(12.dp),
        ) {
            if (!isUser && msg.reasoning.isNotBlank()) {
                Text(
                    "💭 " + msg.reasoning,
                    fontSize = 12.sp,
                    color = ZhijingColors.Muted,
                    fontStyle = FontStyle.Italic,
                )
                Spacer(Modifier.height(4.dp))
            }
            if (msg.content.isNotBlank()) {
                Text(
                    msg.content,
                    fontSize = 15.sp,
                    color = if (isUser) Color.White else ZhijingColors.Ink,
                )
            } else if (!isUser && loading) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
            }
            // 组件卡片
            when (val w = msg.widget) {
                is ChatWidget.Choices -> {
                    Spacer(Modifier.height(8.dp))
                    if (w.style == "select_list") {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            w.options.forEach { o ->
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(ZhijingColors.BrandSoft)
                                        .clickable { onSend(o.send) }
                                        .padding(10.dp),
                                ) { Text(o.label, fontSize = 14.sp, color = ZhijingColors.BrandHot) }
                            }
                        }
                    } else {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            w.options.forEach { o ->
                                Box(
                                    Modifier
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(ZhijingColors.BrandSoft)
                                        .clickable { onSend(o.send) }
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                ) { Text(o.label, fontSize = 13.sp, color = ZhijingColors.BrandHot) }
                            }
                        }
                    }
                }
                is ChatWidget.DatePicker -> {
                    Spacer(Modifier.height(8.dp))
                    DatePickerCard(w.destination, w.suggestDays, onSend = onSend)
                }
                is ChatWidget.PlanResult -> {
                    Spacer(Modifier.height(8.dp))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(ZhijingColors.Brand)
                            .clickable(enabled = !planBusy) { onPlanConfirm(w.action) }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        Text("📋 生成并打开攻略", fontSize = 14.sp, color = Color.White, fontWeight = FontWeight.SemiBold)
                    }
                }
                null -> {}
            }
        }
    }
}

// ---------- 日期选择卡 ----------

@Composable
private fun DatePickerCard(
    destination: String,
    suggestDays: Int,
    onSend: (String) -> Unit,
) {
    val today = remember { Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 12) } }
    var viewMonth by remember {
        mutableStateOf((today.clone() as Calendar).apply { set(Calendar.DAY_OF_MONTH, 1) })
    }
    var rangeStart by remember {
        mutableStateOf((today.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1) })
    }
    var rangeEnd by remember {
        mutableStateOf(
            (today.clone() as Calendar).apply {
                add(Calendar.DAY_OF_YEAR, 1 + (suggestDays.coerceIn(2, 14) - 1))
            },
        )
    }

    val monthLabel = "${viewMonth.get(Calendar.YEAR)}年${viewMonth.get(Calendar.MONTH) + 1}月"
    val cells = remember(viewMonth) {
        val first = (viewMonth.clone() as Calendar).apply { set(Calendar.DAY_OF_MONTH, 1) }
        val pad = first.get(Calendar.DAY_OF_WEEK) - 1
        val days = first.getActualMaximum(Calendar.DAY_OF_MONTH)
        val out = MutableList<Calendar?>(pad) { null }
        for (d in 1..days) {
            out += (first.clone() as Calendar).apply { set(Calendar.DAY_OF_MONTH, d) }
        }
        out
    }
    val pickingEnd = rangeStart.timeInMillis == rangeEnd.timeInMillis
    val totalDays = ((rangeEnd.timeInMillis - rangeStart.timeInMillis) / 86400000).toInt() + 1

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp))
            .background(ZhijingColors.Bg)
            .padding(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("‹", fontSize = 20.sp, modifier = Modifier.clickable {
                viewMonth = (viewMonth.clone() as Calendar).apply { add(Calendar.MONTH, -1) }
            }.padding(8.dp))
            Text(monthLabel, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Text("›", fontSize = 20.sp, modifier = Modifier.clickable {
                viewMonth = (viewMonth.clone() as Calendar).apply { add(Calendar.MONTH, 1) }
            }.padding(8.dp))
        }
        Row(Modifier.fillMaxWidth()) {
            listOf("日", "一", "二", "三", "四", "五", "六").forEach { w ->
                Text(w, fontSize = 11.sp, color = ZhijingColors.Muted, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            }
        }
        cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth()) {
                for (i in 0 until 7) {
                    val cell = week.getOrNull(i)
                    Box(
                        Modifier.weight(1f).height(34.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (cell != null) {
                            val past = cell.before(today) && cell.get(Calendar.DAY_OF_YEAR) != today.get(Calendar.DAY_OF_YEAR)
                            val isEndpoint = cell.get(Calendar.DAY_OF_MONTH) == rangeStart.get(Calendar.DAY_OF_MONTH) &&
                                cell.get(Calendar.MONTH) == rangeStart.get(Calendar.MONTH) &&
                                cell.get(Calendar.YEAR) == rangeStart.get(Calendar.YEAR) ||
                                (cell.get(Calendar.DAY_OF_MONTH) == rangeEnd.get(Calendar.DAY_OF_MONTH) &&
                                    cell.get(Calendar.MONTH) == rangeEnd.get(Calendar.MONTH) &&
                                    cell.get(Calendar.YEAR) == rangeEnd.get(Calendar.YEAR))
                            val inRange = cell.after(rangeStart) && cell.before(rangeEnd)
                            Box(
                                Modifier
                                    .size(30.dp)
                                    .clip(RoundedCornerShape(15.dp))
                                    .background(
                                        when {
                                            past -> Color.Transparent
                                            isEndpoint -> ZhijingColors.Ink
                                            inRange -> ZhijingColors.BrandSoft
                                            else -> Color.Transparent
                                        },
                                    )
                                    .clickable(enabled = !past) {
                                        if (rangeStart.timeInMillis != rangeEnd.timeInMillis || rangeStart.timeInMillis == 0L) {
                                            rangeStart = cell; rangeEnd = cell
                                        } else if (cell.before(rangeStart)) {
                                            rangeStart = cell; rangeEnd = cell
                                        } else {
                                            rangeEnd = cell
                                        }
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "${cell.get(Calendar.DAY_OF_MONTH)}",
                                    fontSize = 13.sp,
                                    color = when {
                                        past -> ZhijingColors.Muted
                                        isEndpoint -> Color.White
                                        else -> ZhijingColors.Ink
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
        Text(
            if (pickingEnd) "出发 ${rangeStart.get(Calendar.MONTH) + 1}月${rangeStart.get(Calendar.DAY_OF_MONTH)}日 · 请再点返程日期"
            else "${rangeStart.get(Calendar.MONTH) + 1}月${rangeStart.get(Calendar.DAY_OF_MONTH)}日 – ${rangeEnd.get(Calendar.MONTH) + 1}月${rangeEnd.get(Calendar.DAY_OF_MONTH)}日 · 共 $totalDays 天",
            fontSize = 12.sp,
            color = ZhijingColors.Muted,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier.weight(1f)
                    .clip(RoundedCornerShape(22.dp))
                    .border(1.dp, ZhijingColors.Line, RoundedCornerShape(22.dp))
                    .clickable { onSend("出发日期暂不设置") }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) { Text("暂不设置", fontSize = 14.sp, color = ZhijingColors.Muted) }
            Box(
                Modifier.weight(1f)
                    .clip(RoundedCornerShape(22.dp))
                    .background(if (pickingEnd) ZhijingColors.Muted else ZhijingColors.Ink)
                    .clickable(enabled = !pickingEnd) {
                        val dest = if (destination.isNotBlank()) " 去$destination" else ""
                        onSend("我想 ${iso(rangeStart)} 出发$dest，玩 $totalDays 天（到 ${iso(rangeEnd)}）")
                    }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) { Text("确认", fontSize = 14.sp, color = Color.White, fontWeight = FontWeight.Bold) }
        }
    }
}
