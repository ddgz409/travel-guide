package com.travelguide.app.ui.screens.chat

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.api.ChatMessageDto
import com.travelguide.app.data.api.ChatStreamRequest
import com.travelguide.app.data.api.ErrorBody
import com.travelguide.app.data.api.GeneratePayload
import com.travelguide.app.data.api.GenPreferences
import com.travelguide.app.data.api.CollectionPlace
import com.travelguide.app.data.local.ChatHistoryMsg
import com.travelguide.app.data.local.ChatHistorySession
import com.travelguide.app.data.local.ChatHistoryStore
import com.travelguide.app.data.local.CollectionPrefillStore
import com.travelguide.app.data.local.GuestStore
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.local.toLlmOverride
import com.travelguide.app.data.util.getChatSearchSubtitle
import com.travelguide.app.ui.components.ModelPickerSheet
import com.travelguide.app.ui.components.TripListSheet
import com.travelguide.app.ui.components.toAgentTrips
import com.travelguide.app.ui.components.rememberModelPicker
import com.travelguide.app.ui.theme.ZhijingColors
import java.io.IOException
import java.net.SocketTimeoutException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private const val AI_IDLE_TIMEOUT_MS = 75_000L

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
    @SerialName("rate_limited") val rateLimited: Boolean = false,
)

private sealed interface DialogState {
    data class OpenTrip(val title: String, val tripId: String) : DialogState
    data class DeleteTrip(val tripId: String, val title: String, val meta: String) : DialogState
    data class PlanConfirm(val action: JsonObject) : DialogState
    data class TripList(val trips: List<JsonObject>, val message: String? = null) : DialogState
}

private fun iso(cal: Calendar): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)

private fun slimHistory(msgs: List<ChatMsg>): List<ChatHistoryMsg> =
    msgs
        .filter { m ->
            m.role == "user" || m.content.isNotBlank() || m.reasoning.isNotBlank() || m.widget != null
        }
        .map { ChatHistoryMsg(it.role, it.content, it.reasoning) }

private suspend fun persistChatSession(userKey: String, sessionId: String, msgs: List<ChatMsg>) {
    if (msgs.isEmpty()) return
    val slim = slimHistory(msgs)
    if (slim.isEmpty()) return
    val title = (msgs.find { it.role == "user" }?.content ?: "新对话").take(30)
    ChatHistoryStore.saveSession(
        userKey,
        ChatHistorySession(
            id = sessionId,
            title = title,
            msgs = slim,
            updatedAt = System.currentTimeMillis(),
        ),
    )
}

// ---------- 主屏 ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChatScreen(
    tripId: String?,
    onBack: () -> Unit,
    onOpenTrip: (String) -> Unit,
    prefill: String? = null,
    sessionId: String? = null,
    onOpenHistory: () -> Unit = {},
    onOpenPhoto: () -> Unit = {},
    onOpenShare: (String) -> Unit = {},
    onOpenCollectionEditor: () -> Unit = {},
    onOpenModelManage: () -> Unit = {},
) {
    val modelPicker = rememberModelPicker(onOpenModelManage)
    val activeSessionId = remember {
        sessionId?.takeIf { it.isNotBlank() } ?: ChatHistoryStore.genSessionId()
    }
    var userKey by remember { mutableStateOf("guest") }
    var msgs by remember { mutableStateOf(emptyList<ChatMsg>()) }
    var input by remember { mutableStateOf(prefill.orEmpty()) }
    var loading by remember { mutableStateOf(false) }
    var planBusy by remember { mutableStateOf(false) }
    var smartPlanMode by remember { mutableStateOf(false) }
    var rateLimited by remember { mutableStateOf(false) }
    val smartPlanBackRef = remember { mutableStateOf<(() -> Boolean)?>(null) }
    var dialog by remember { mutableStateOf<DialogState?>(null) }
    val msgsSnapshot = remember { mutableStateOf(msgs) }
    SideEffect { msgsSnapshot.value = msgs }

    val scope = rememberCoroutineScope()
    val callRef = remember { mutableStateOf<retrofit2.Call<okhttp3.ResponseBody>?>(null) }
    val listState = rememberLazyListState()

    fun pushAssistant(text: String) {
        msgs = msgs + ChatMsg("assistant", text)
    }

    fun updateLast(content: String, reasoning: String, widget: ChatWidget?) {
        msgs = msgs.dropLast(1) + ChatMsg("assistant", content, reasoning, widget)
    }

    LaunchedEffect(Unit) {
        userKey = runCatching { ApiClient.auth.me().id }.getOrDefault("guest")
    }

    LaunchedEffect(activeSessionId, userKey) {
        val session = ChatHistoryStore.getSession(userKey, activeSessionId)
        if (session != null && session.msgs.isNotEmpty()) {
            msgs = session.msgs.map { m -> ChatMsg(m.role, m.content, m.reasoning) }
        }
    }

    // 消息变化时防抖落盘（对齐 RN）
    LaunchedEffect(msgs, userKey) {
        if (msgs.isEmpty()) return@LaunchedEffect
        delay(400)
        persistChatSession(userKey, activeSessionId, msgs)
    }

    DisposableEffect(activeSessionId, userKey) {
        onDispose {
            val latest = msgsSnapshot.value
            if (latest.isNotEmpty()) {
                kotlinx.coroutines.runBlocking {
                    persistChatSession(userKey, activeSessionId, latest)
                }
            }
        }
    }

    // 新消息/流式更新时滚到底部
    val showWelcome = msgs.isEmpty()
    LaunchedEffect(msgs.size, msgs.lastOrNull()?.content?.length ?: 0) {
        if (!showWelcome && msgs.isNotEmpty()) {
            listState.scrollToItem(msgs.size - 1)
        }
    }

    fun send(raw: String) {
        val text = raw.trim()
        if (text.isEmpty() || loading) return
        input = ""
        val history = msgs + ChatMsg("user", text)
        msgs = history + ChatMsg("assistant")
        loading = true
        rateLimited = false

        scope.launch(Dispatchers.IO) {
            val call = ApiClient.chat.stream(
                ChatStreamRequest(
                    messages = history.map { ChatMessageDto(it.role, it.content) },
                    tripId = tripId,
                    llm = modelPicker.curModel.toLlmOverride(),
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
                    if (resp.code() == 429) {
                        withContext(Dispatchers.Main) { rateLimited = true }
                    }
                    updateLast("❌ $detail", "", null)
                    return@launch
                }
                val source = resp.body()!!.source()
                source.timeout().timeout(AI_IDLE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    source.timeout().timeout(AI_IDLE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                    if (!line.startsWith("data: ")) continue
                    val data = line.removePrefix("data: ").trim()
                    if (data == "[DONE]") break
                    val ev = runCatching { AppJson.decodeFromString<SseEvent>(data) }.getOrNull() ?: continue
                    when (ev.type) {
                        "content" -> aiContent += ev.content
                        "error" -> {
                            aiContent += ev.content
                            if (ev.rateLimited) {
                                withContext(Dispatchers.Main) { rateLimited = true }
                            }
                        }
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
                                        p["message"]?.jsonPrimitive?.contentOrNull,
                                    )
                                }
                                "open_share" -> {
                                    val token = p["token"]?.jsonPrimitive?.contentOrNull
                                    if (!token.isNullOrBlank()) {
                                        withContext(Dispatchers.Main) {
                                            loading = false
                                            onOpenShare(token)
                                        }
                                        return@launch
                                    }
                                }
                                "open_collection_editor" -> withContext(Dispatchers.Main) {
                                    loading = false
                                    val places = p["places"]?.jsonArray?.mapNotNull { el ->
                                        val obj = el.jsonObject
                                        val name = obj["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                                        CollectionPlace(
                                            name = name,
                                            city = obj["city"]?.jsonPrimitive?.contentOrNull,
                                            address = obj["address"]?.jsonPrimitive?.contentOrNull,
                                            lat = obj["lat"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull(),
                                            lng = obj["lng"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull(),
                                        )
                                    } ?: emptyList()
                                    CollectionPrefillStore.pending = CollectionPrefillStore.Prefill(
                                        title = p["title"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                        summary = p["summary"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                        emoji = p["emoji"]?.jsonPrimitive?.contentOrNull ?: "📁",
                                        destination = p["destination"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                        places = places,
                                    )
                                    onOpenCollectionEditor()
                                }
                                else -> {}
                            }
                        }
                        "tool_result" -> if (ev.tool == "list_trips") {
                            val root = runCatching {
                                AppJson.parseToJsonElement(ev.result.orEmpty()).jsonObject
                            }.getOrNull()
                            val arr = root?.get("trips")?.jsonArray
                            if (arr != null) withContext(Dispatchers.Main) {
                                dialog = DialogState.TripList(
                                    arr.map { it.jsonObject },
                                    root["message"]?.jsonPrimitive?.contentOrNull,
                                )
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
                if (call.isCanceled) {
                    // 用户主动停止
                } else {
                    updateLast(
                        "⏱️ AI 长时间没有响应，已自动断开。请重试，或在「模型管理」切换更稳定的模型。",
                        aiReasoning,
                        aiWidget,
                    )
                }
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

    fun clearChat() {
        stop()
        msgs = emptyList()
        input = ""
        scope.launch { ChatHistoryStore.deleteSession(userKey, activeSessionId) }
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
                    llm = modelPicker.curModel.toLlmOverride(),
                )
                val trip = if (GuestStore.isGuestSync() && TokenStore.getSync() == null) {
                    ApiClient.trips.guestGenerate(payload).also { GuestStore.rememberTrip(it.id) }
                } else {
                    ApiClient.trips.generate(payload)
                }
                withContext(Dispatchers.Main) { onOpenTrip(trip.id) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { pushAssistant("❌ ${e.message ?: "规划失败，请重试"}") }
            } finally {
                withContext(Dispatchers.Main) { planBusy = false }
            }
        }
    }

    BackHandler(enabled = smartPlanMode) {
        if (smartPlanBackRef.value?.invoke() != true) smartPlanMode = false
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ChatScreenHeader(
            smartPlanMode = smartPlanMode,
            tripId = tripId,
            modelProvider = modelPicker.curModel.provider,
            modelLabel = modelPicker.curModel.label,
            hasConversation = msgs.isNotEmpty(),
            onBack = {
                if (smartPlanMode) {
                    if (smartPlanBackRef.value?.invoke() != true) smartPlanMode = false
                } else onBack()
            },
            onOpenSmartPlan = { smartPlanMode = true },
            onOpenHistory = onOpenHistory,
            onClear = ::clearChat,
        )

        if (smartPlanMode) {
            SmartPlanPanel(
                onClose = { smartPlanMode = false },
                onOpenTrip = onOpenTrip,
                backHandlerRef = smartPlanBackRef,
                onOpenModelManage = onOpenModelManage,
            )
        } else {
            if (showWelcome) {
                ChatWelcomePane(
                    modifier = Modifier.weight(1f),
                    onOpenSmartPlan = { smartPlanMode = true },
                    onQuickSend = ::send,
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        horizontal = 12.dp,
                        vertical = 8.dp,
                    ),
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
            }

            if (rateLimited && !smartPlanMode) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFFF8E6))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "⚠️ 免费模型暂时繁忙（被限流），建议切换到更稳定的免费模型",
                        Modifier.weight(1f),
                        fontSize = 12.sp,
                        color = Color(0xFF8A6100),
                        lineHeight = 18.sp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(14.dp))
                            .background(ZhijingColors.Brand)
                            .clickable { modelPicker.openModelPopup() }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Text("切换模型", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }

            ChatInputBar(
                modelLabel = modelPicker.curModel.label,
                input = input,
                onInputChange = { input = it },
                loading = loading,
                onOpenModelPicker = { modelPicker.openModelPopup() },
                onOpenPhoto = onOpenPhoto,
                onSend = { send(input) },
                onStop = ::stop,
            )
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
        is DialogState.TripList -> TripListSheet(
            visible = true,
            trips = d.trips.toAgentTrips(),
            message = d.message,
            onClose = { dialog = null },
            onSelect = { tripId ->
                dialog = null
                onOpenTrip(tripId)
            },
        )
        null -> {}
    }

    ModelPickerSheet(modelPicker)
}

// ---------- 布局组件 ----------

@Composable
private fun ChatScreenHeader(
    smartPlanMode: Boolean,
    tripId: String?,
    modelProvider: String,
    modelLabel: String,
    hasConversation: Boolean,
    onBack: () -> Unit,
    onOpenSmartPlan: () -> Unit,
    onOpenHistory: () -> Unit,
    onClear: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(ZhijingColors.Card)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "‹",
                fontSize = 28.sp,
                color = ZhijingColors.Ink,
                modifier = Modifier.clickable(onClick = onBack).padding(horizontal = 8.dp, vertical = 4.dp),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    if (smartPlanMode) "智能规划" else "AI 旅行助手",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.Ink,
                )
                Text(
                    if (smartPlanMode) {
                        "输入关键词，一键生成行程"
                    } else {
                        getChatSearchSubtitle(modelProvider, modelLabel) +
                            if (tripId != null) " · 已关联行程" else ""
                    },
                    fontSize = 11.sp,
                    color = ZhijingColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (!smartPlanMode) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HeaderChip("历史", filled = false, onClick = onOpenHistory)
                if (hasConversation) {
                    HeaderChip("清空", filled = true, onClick = onClear)
                }
                Box(
                    Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(ZhijingColors.Ink)
                        .clickable(onClick = onOpenSmartPlan)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text("智能规划", fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(ZhijingColors.Line))
}

@Composable
private fun HeaderChip(label: String, filled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(18.dp))
            .background(if (filled) ZhijingColors.BrandSoft else ZhijingColors.Card)
            .then(
                if (filled) Modifier else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(18.dp)),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            label,
            fontSize = 12.sp,
            color = if (filled) ZhijingColors.BrandHot else ZhijingColors.Ink,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChatWelcomePane(
    modifier: Modifier = Modifier,
    onOpenSmartPlan: () -> Unit,
    onQuickSend: (String) -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("🌍", fontSize = 48.sp)
        Spacer(Modifier.height(16.dp))
        Text(
            WELCOME,
            fontSize = 14.sp,
            color = ZhijingColors.Muted,
            lineHeight = 22.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(26.dp))
                .background(ZhijingColors.Ink)
                .clickable(onClick = onOpenSmartPlan)
                .padding(vertical = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("✦ 体验智能规划", fontSize = 15.sp, color = Color.White, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(12.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            QUICK.forEach { (label, text) ->
                Box(
                    Modifier
                        .clip(RoundedCornerShape(26.dp))
                        .background(ZhijingColors.Card)
                        .border(1.dp, ZhijingColors.Line, RoundedCornerShape(26.dp))
                        .clickable { onQuickSend(text) }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(label, fontSize = 12.sp, color = ZhijingColors.Ink, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun ChatInputBar(
    modelLabel: String,
    input: String,
    onInputChange: (String) -> Unit,
    loading: Boolean,
    onOpenModelPicker: () -> Unit,
    onOpenPhoto: () -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(ZhijingColors.Card)
            .imePadding()
            .navigationBarsPadding(),
    ) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(ZhijingColors.Line))
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Box(
                Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(ZhijingColors.BrandSoft)
                    .border(1.dp, ZhijingColors.Brand, RoundedCornerShape(20.dp))
                    .clickable(onClick = onOpenModelPicker)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(
                    "$modelLabel ▲",
                    fontSize = 12.sp,
                    color = ZhijingColors.BrandHot,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                InputCircleButton(
                    enabled = !loading,
                    background = ZhijingColors.BrandSoft,
                    borderColor = ZhijingColors.Brand,
                    onClick = onOpenPhoto,
                ) {
                    Icon(
                        Icons.Filled.PhotoCamera,
                        contentDescription = "拍照识景",
                        tint = ZhijingColors.BrandHot,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Spacer(Modifier.width(8.dp))
                TextField(
                    value = input,
                    onValueChange = onInputChange,
                    placeholder = { Text("输入旅行问题…", color = ZhijingColors.Muted) },
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 42.dp),
                    enabled = !loading,
                    shape = RoundedCornerShape(26.dp),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = ZhijingColors.Bg,
                        unfocusedContainerColor = ZhijingColors.Bg,
                        disabledContainerColor = ZhijingColors.Bg,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        disabledIndicatorColor = Color.Transparent,
                    ),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    maxLines = 4,
                )
                Spacer(Modifier.width(8.dp))
                val canSend = input.trim().isNotEmpty()
                InputCircleButton(
                    enabled = loading || canSend,
                    background = when {
                        loading -> ZhijingColors.Danger
                        canSend -> ZhijingColors.Brand
                        else -> ZhijingColors.Brand.copy(alpha = 0.4f)
                    },
                    borderColor = Color.Transparent,
                    onClick = { if (loading) onStop() else onSend() },
                ) {
                    if (loading) {
                        Icon(
                            Icons.Filled.Stop,
                            contentDescription = "停止",
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    } else {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = "发送",
                            tint = Color.White,
                            modifier = Modifier
                                .size(20.dp)
                                .padding(start = 2.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InputCircleButton(
    enabled: Boolean,
    background: Color,
    borderColor: Color,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        Modifier
            .size(42.dp)
            .clip(CircleShape)
            .background(background)
            .then(
                if (borderColor.alpha > 0f) {
                    Modifier.border(1.dp, borderColor, CircleShape)
                } else {
                    Modifier
                },
            )
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        content()
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
                .fillMaxWidth(if (isUser) 0.82f else 0.88f)
                .clip(
                    RoundedCornerShape(
                        topStart = if (isUser) 16.dp else 4.dp,
                        topEnd = if (isUser) 4.dp else 16.dp,
                        bottomStart = 16.dp,
                        bottomEnd = 16.dp,
                    ),
                )
                .background(if (isUser) ZhijingColors.Brand else ZhijingColors.Card)
                .then(
                    if (isUser) Modifier else Modifier.border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp)),
                )
                .padding(horizontal = 14.dp, vertical = 10.dp),
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
