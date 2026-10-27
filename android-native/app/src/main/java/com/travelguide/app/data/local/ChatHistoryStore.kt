package com.travelguide.app.data.local

import android.content.Context
import com.travelguide.app.data.api.AppJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** AI 对话历史（本地持久化，按用户隔离，对齐 RN chatHistoryStore.ts） */

@Serializable
data class ChatHistoryMsg(
    val role: String,
    val content: String,
    val reasoning: String = "",
    val widget: ChatHistoryWidget? = null,
)

@Serializable
data class ChatHistoryWidget(
    val kind: String,
    val action: JsonObject? = null,
)

@Serializable
data class ChatHistorySession(
    val id: String,
    val title: String,
    val msgs: List<ChatHistoryMsg> = emptyList(),
    val updatedAt: Long,
)

object ChatHistoryStore {
    private const val PREFIX = "chat_history_v1_"
    private const val MAX_SESSIONS = 30
    private var ctx: Context? = null

    fun init(context: Context) {
        ctx = context.applicationContext
    }

    private fun key(userKey: String) = "$PREFIX$userKey"

    private suspend fun readAll(userKey: String): List<ChatHistorySession> = withContext(Dispatchers.IO) {
        val c = ctx ?: return@withContext emptyList()
        val raw = c.getSharedPreferences("travel_guide", Context.MODE_PRIVATE).getString(key(userKey), null)
            ?: return@withContext emptyList()
        runCatching {
            AppJson.decodeFromString(
                kotlinx.serialization.builtins.ListSerializer(ChatHistorySession.serializer()),
                raw,
            )
        }.getOrDefault(emptyList())
    }

    suspend fun listSessions(userKey: String): List<ChatHistorySession> =
        readAll(userKey).sortedByDescending { it.updatedAt }

    suspend fun getSession(userKey: String, id: String): ChatHistorySession? =
        readAll(userKey).find { it.id == id }

    suspend fun saveSession(userKey: String, session: ChatHistorySession) = withContext(Dispatchers.IO) {
        val c = ctx ?: return@withContext
        val all = readAll(userKey).toMutableList()
        val idx = all.indexOfFirst { it.id == session.id }
        if (idx >= 0) all[idx] = session else all.add(session)
        val trimmed = all.sortedByDescending { it.updatedAt }.take(MAX_SESSIONS)
        c.getSharedPreferences("travel_guide", Context.MODE_PRIVATE)
            .edit()
            .putString(
                key(userKey),
                AppJson.encodeToString(
                    kotlinx.serialization.builtins.ListSerializer(ChatHistorySession.serializer()),
                    trimmed,
                ),
            )
            .apply()
    }

    suspend fun deleteSession(userKey: String, id: String) = withContext(Dispatchers.IO) {
        val c = ctx ?: return@withContext
        val all = readAll(userKey).filter { it.id != id }
        c.getSharedPreferences("travel_guide", Context.MODE_PRIVATE)
            .edit()
            .putString(
                key(userKey),
                AppJson.encodeToString(
                    kotlinx.serialization.builtins.ListSerializer(ChatHistorySession.serializer()),
                    all,
                ),
            )
            .apply()
    }

    fun genSessionId(): String = "${System.currentTimeMillis()}-${(0..999999).random().toString(36)}"
}
