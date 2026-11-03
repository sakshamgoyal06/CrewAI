package app.magnus.health

import android.content.Context
import java.time.Instant

/**
 * The personal token the PWA handed over, and when we last synced. App-private storage: the
 * token only reaches the Health Connect ingest and can be revoked from the app's settings.
 */
class SyncStore(context: Context) {
    private val prefs = context.getSharedPreferences("magnus_sync", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("token", null)
        set(value) = prefs.edit().putString("token", value).apply()

    var lastSync: Instant?
        get() = prefs.getLong("last_sync", 0L).takeIf { it > 0 }?.let(Instant::ofEpochMilli)
        set(value) = prefs.edit().putLong("last_sync", value?.toEpochMilli() ?: 0L).apply()

    var lastError: String?
        get() = prefs.getString("last_error", null)
        set(value) = prefs.edit().putString("last_error", value).apply()

    /** False until a sync with hour-aligned buckets has gone through (builds before 0.3.0 didn't align). */
    var bucketsAligned: Boolean
        get() = prefs.getBoolean("buckets_aligned", false)
        set(value) = prefs.edit().putBoolean("buckets_aligned", value).apply()

    /** HealthSync.PERMISSIONS_VERSION last asked for; lower means new data types to ask about. */
    var permissionsAsked: Int
        get() = prefs.getInt("permissions_asked", 1)
        set(value) = prefs.edit().putInt("permissions_asked", value).apply()

    fun clear() = prefs.edit().clear().apply()
}
