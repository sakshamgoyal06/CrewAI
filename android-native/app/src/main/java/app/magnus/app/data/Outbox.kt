package app.magnus.app.data

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.magnus.app.appGraph
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.io.IOException

/**
 * Logs made with no connection, kept on the phone and sent when it's back online: the same
 * idempotent logs the PWA queues (app.js QUEUEABLE). Anything else fails as usual, because it needs
 * an answer from the server (a chat reply, a meal estimate).
 */
class Outbox(private val context: Context) {
    @Serializable
    data class Item(val path: String, val body: String, val at: Long)

    private val file = File(context.filesDir, "outbox.json")
    private val lock = Mutex()
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 4)

    /** One-line notes for the toast: saved offline, or synced later. */
    val events: SharedFlow<String> = _events

    private fun read(): List<Item> = try {
        if (file.exists()) MagnusJson.decodeFromString(ListSerializer(Item.serializer()), file.readText()) else emptyList()
    } catch (_: Exception) {
        emptyList()
    }

    private fun write(items: List<Item>) {
        if (items.isEmpty()) file.delete() else file.writeText(MagnusJson.encodeToString(ListSerializer(Item.serializer()), items))
    }

    suspend fun add(path: String, body: String) {
        lock.withLock { write((read() + Item(path, body, System.currentTimeMillis())).takeLast(MAX)) }
        _events.tryEmit(SAVED)
        schedule(context)
    }

    suspend fun size(): Int = lock.withLock { read().size }

    /**
     * Sends what's waiting, oldest first. A log the server turns down is dropped (as the PWA does);
     * one that can't reach the server, or finds it down, waits for the next try. Returns true when
     * nothing is left.
     */
    suspend fun flush(api: Api): Boolean = lock.withLock {
        val items = read()
        if (items.isEmpty()) return@withLock true
        val left = mutableListOf<Item>()
        var sent = 0
        var offline = false
        for (item in items) {
            if (offline || System.currentTimeMillis() - item.at > MAX_AGE_MS) {
                if (offline) left += item
                continue
            }
            try {
                api.sendNow("POST", item.path, item.body)
                sent++
            } catch (e: ApiException) {
                if (e.status >= 500 || e.code == "signed_out") left += item
            } catch (_: IOException) {
                offline = true
                left += item
            }
        }
        write(left)
        if (sent > 0) _events.tryEmit("Synced $sent saved log${if (sent == 1) "" else "s"}.")
        left.isEmpty()
    }

    fun clear() {
        file.delete()
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }

    companion object {
        private const val MAX = 50
        private const val MAX_AGE_MS = 7L * 24 * 3600 * 1000
        private const val WORK = "magnus-outbox"
        const val SAVED = "Offline. Saved on this phone; it syncs when you're back online."

        /** POST paths that are safe to send later (the server de-duplicates them). */
        private val QUEUEABLE = listOf(
            Regex("^/steps$"), Regex("^/checkins$"), Regex("^/meals/confirm$"),
            Regex("^/workout-check$"), Regex("^/routine/check$"), Regex("^/activities$"),
        )

        fun queueable(method: String, path: String) = method == "POST" && QUEUEABLE.any { it.matches(path) }

        /** The answer a queued log gets, so callers carry on as if it was sent. */
        const val QUEUED_ANSWER = """{"ok":true,"queued":true}"""

        fun isQueued(answer: String) = answer == QUEUED_ANSWER

        /** Wakes when there's a connection, even with the app closed. */
        fun schedule(context: Context) {
            val req = OneTimeWorkRequestBuilder<OutboxWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.KEEP, req)
        }
    }
}

class OutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = applicationContext.appGraph
        if (graph.auth.session.value == null) return Result.success()
        return if (graph.outbox.flush(graph.api)) Result.success() else Result.retry()
    }
}
