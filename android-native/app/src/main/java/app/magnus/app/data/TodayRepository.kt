package app.magnus.app.data

import android.content.Context
import java.io.File

/** /today with the last answer kept on the phone, so the screen opens at once and offline. */
class TodayRepository(context: Context, private val api: Api) {
    private val file = File(context.filesDir, "cache-today.json")

    data class Loaded(val snapshot: TodaySnapshot, val savedAt: Long, val fromCache: Boolean)

    fun cached(): Loaded? = try {
        if (!file.exists()) null
        else Loaded(MagnusJson.decodeFromString(TodaySnapshot.serializer(), file.readText()), file.lastModified(), true)
    } catch (_: Exception) {
        null
    }

    suspend fun refresh(): Loaded {
        val text = api.getText("/today")
        val snap = MagnusJson.decodeFromString(TodaySnapshot.serializer(), text)
        runCatching { file.writeText(text) }
        return Loaded(snap, System.currentTimeMillis(), false)
    }

    fun clear() {
        file.delete()
    }
}
