package app.magnus.app.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import java.util.UUID

@Serializable
data class ChatRow(
    val role: String = "assistant",
    val content: String = "",
    /** Cards stay JSON: the server owns their shape, and a card kind the app doesn't know still shows. */
    val cards: List<JsonObject> = emptyList(),
    val createdAt: String = "",
    val turnId: String? = null,
    val status: String = "ok",
)

@Serializable
data class ChatHistory(val messages: List<ChatRow> = emptyList(), val date: String = "")

@Serializable
data class ChatReply(
    val text: String = "",
    val cards: List<JsonObject> = emptyList(),
    val changed: Boolean = false,
    val turnId: String? = null,
)

data class ChatUi(
    val rows: List<ChatRow> = emptyList(),
    val loaded: Boolean = false,
    val offline: Boolean = false,
    val sending: Boolean = false,
    val turnId: String? = null,
    /** While the coach works: the tool step it's on, then its words as they arrive. */
    val progress: String? = null,
    val liveText: String? = null,
    /** A failed turn: what to show and what Retry resends (same turn id, so it can't log twice). */
    val error: String? = null,
    val retryText: String? = null,
    val retryTurnId: String? = null,
    /** Bumped when a turn wrote data, so other screens can refresh. */
    val dataVersion: Int = 0,
    /** Bumped when a draft is discarded on this phone, so its card redraws. */
    val discards: Int = 0,
)

/**
 * Today's coach thread, kept outside any screen so a reply keeps streaming while you look at
 * another tab. The saved copy shows first, offline included.
 */
class ChatStore(context: Context, private val api: Api) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val file = File(context.filesDir, "cache-chat.json")
    private val discardedPrefs = context.getSharedPreferences("magnus-discarded-drafts", Context.MODE_PRIVATE)
    private val _ui = MutableStateFlow(ChatUi(rows = cached()))
    val ui: StateFlow<ChatUi> = _ui
    private var turnJob: Job? = null

    private fun cached(): List<ChatRow> = try {
        if (file.exists()) MagnusJson.decodeFromString(ChatHistory.serializer(), file.readText()).messages else emptyList()
    } catch (_: Exception) {
        emptyList()
    }

    fun refresh() {
        scope.launch { load() }
    }

    private suspend fun load() {
        try {
            val text = api.getText("/chat")
            val h = MagnusJson.decodeFromString(ChatHistory.serializer(), text)
            withContext(Dispatchers.IO) { runCatching { file.writeText(text) } }
            _ui.update { it.copy(rows = h.messages, loaded = true, offline = false) }
        } catch (_: Exception) {
            _ui.update { it.copy(loaded = true, offline = true) }
        }
    }

    fun send(text: String, turnId: String = UUID.randomUUID().toString()) {
        val t = text.trim()
        if (t.isEmpty() || _ui.value.sending) return
        val mine = ChatRow(role = "user", content = t, createdAt = java.time.Instant.now().toString(), turnId = turnId)
        _ui.update {
            it.copy(
                rows = if (it.retryTurnId == turnId) it.rows else it.rows + mine,
                sending = true, turnId = turnId, progress = null, liveText = null,
                error = null, retryText = null, retryTurnId = null,
            )
        }
        turnJob = scope.launch {
            try {
                val reply = stream(t, turnId)
                val coach = ChatRow(role = "assistant", content = reply.text, cards = reply.cards, createdAt = java.time.Instant.now().toString(), turnId = turnId)
                _ui.update {
                    it.copy(
                        rows = it.rows + coach, sending = false, turnId = null, progress = null, liveText = null,
                        dataVersion = it.dataVersion + if (reply.changed) 1 else 0,
                    )
                }
                // The server's copy carries each card's live state (logged, answered).
                load()
            } catch (e: kotlinx.coroutines.CancellationException) {
                _ui.update { it.copy(sending = false, turnId = null, progress = null, liveText = null) }
                throw e
            } catch (e: Exception) {
                _ui.update {
                    it.copy(
                        sending = false, turnId = null, progress = null, liveText = null,
                        error = friendly(e), retryText = t, retryTurnId = turnId,
                    )
                }
            }
        }
    }

    fun retry() {
        val s = _ui.value
        if (s.retryText != null && s.retryTurnId != null) send(s.retryText, s.retryTurnId)
    }

    /** Stop asks the server to end the turn; the stream then closes with what was said so far. */
    fun stop() {
        val id = _ui.value.turnId ?: return
        scope.launch {
            runCatching { api.send("POST", "/chat/stop", buildJsonObject { put("turnId", id) }.toString()) }
        }
    }

    /** After a card's button changed something: reload the thread and tell Today. */
    fun cardChanged() {
        _ui.update { it.copy(dataVersion = it.dataVersion + 1) }
        refresh()
    }

    fun isDiscarded(draftId: String) = discardedPrefs.getBoolean(draftId, false)
    fun discard(draftId: String) {
        discardedPrefs.edit().putBoolean(draftId, true).apply()
        _ui.update { it.copy(discards = it.discards + 1) }
    }

    fun clear() {
        file.delete()
        _ui.value = ChatUi()
    }

    private suspend fun stream(text: String, turnId: String): ChatReply {
        val body = buildJsonObject {
            put("text", text)
            put("turnId", turnId)
        }.toString()
        val res = api.openStream("/chat/stream", body)
        return withContext(Dispatchers.IO) {
            res.use { r ->
                val source = r.body?.source() ?: throw java.io.IOException("empty")
                var data: String? = null
                while (true) {
                    val line = source.readUtf8Line() ?: break
                    if (line.startsWith("data:")) {
                        data = line.removePrefix("data:").trim()
                        continue
                    }
                    if (line.isNotEmpty() || data == null) continue
                    val event = MagnusJson.parseToJsonElement(data) as JsonObject
                    data = null
                    when (event["type"]?.jsonPrimitive?.contentOrNull) {
                        "progress" -> { val p = event["text"]?.jsonPrimitive?.contentOrNull; _ui.update { it.copy(progress = p) } }
                        "delta" -> {
                            val d = event["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            _ui.update { it.copy(liveText = (it.liveText ?: "") + d) }
                        }
                        "done" -> return@withContext MagnusJson.decodeFromJsonElement(ChatReply.serializer(), event["reply"] ?: JsonObject(emptyMap()))
                        "error" -> throw ChatTurnException(event["message"]?.jsonPrimitive?.contentOrNull ?: "Something went wrong. Tap Retry.")
                    }
                }
                throw ChatTurnException("The answer was cut off. Tap Retry.")
            }
        }
    }

    private fun friendly(e: Exception): String = when (e) {
        is ChatTurnException -> e.message ?: "Something went wrong. Tap Retry."
        is ApiException -> when (e.code) {
            "free_limit" -> "That's today's free coach messages. Logging from Today still works."
            "daily_limit" -> "That's the coach's limit for today. It resets tomorrow."
            "spend_limit" -> "The coach is paused for today. Logging from Today still works."
            "in_progress", "busy" -> "Still working on your last message. Give it a moment."
            else -> "The coach couldn't answer (${e.status}). Tap Retry."
        }
        is java.net.SocketTimeoutException -> "Lost the connection mid-answer. Tap Retry."
        else -> "No connection. Tap Retry when you're back online."
    }
}

class ChatTurnException(message: String) : Exception(message)
