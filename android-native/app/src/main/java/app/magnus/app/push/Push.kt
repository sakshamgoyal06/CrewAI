package app.magnus.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.magnus.app.BuildConfig
import app.magnus.app.MainActivity
import app.magnus.app.R
import app.magnus.app.appGraph
import app.magnus.app.data.HttpClient
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Native push through Firebase Cloud Messaging. The server sends data-only, high-priority messages
 * (src/healthApp/fcm.ts), so this app draws each notification on its own channel and reports a
 * receipt, as the PWA's service worker does. Firebase is set up from build config, so a build
 * without it simply has no push.
 */
object Push {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Channels you can mute one by one in Android settings. */
    private val CHANNELS = listOf(
        Triple("meals", "Meals", "Meal times and plan reminders"),
        Triple("movement", "Movement", "Walks, steps and workout checks"),
        Triple("coach", "Coach", "Morning plan, evening wrap and check-ins"),
        Triple("weigh_in", "Weigh-in", "Weekly weigh-in reminder"),
    )

    private fun channelFor(tag: String?): String = when (tag) {
        "meal_reminder", "plan_meal" -> "meals"
        "step_pace", "routine_reminder", "routine_check", "workout_check" -> "movement"
        "weigh_in" -> "weigh_in"
        else -> "coach"
    }

    fun configured(): Boolean = BuildConfig.FIREBASE_APP_ID.isNotBlank() && BuildConfig.FIREBASE_PROJECT_ID.isNotBlank()

    private fun ensureFirebase(context: Context): Boolean {
        if (!configured()) return false
        if (FirebaseApp.getApps(context).isEmpty()) {
            FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                    .setApiKey(BuildConfig.FIREBASE_API_KEY)
                    .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                    .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                    .build(),
            )
        }
        return true
    }

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        for ((id, name, desc) in CHANNELS) {
            nm.createNotificationChannel(NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply { description = desc })
        }
    }

    /** After sign-in and on every open: send this install's token, so a lost row heals itself (#222). */
    fun register(context: Context) {
        if (!ensureFirebase(context)) return
        createChannels(context)
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> upload(context, token) }
    }

    fun upload(context: Context, token: String) {
        val graph = context.appGraph
        if (graph.auth.session.value == null) return
        scope.launch {
            runCatching { graph.api.send("POST", "/push/fcm", buildJsonObject { put("token", token) }.toString()) }
        }
    }

    fun show(context: Context, data: Map<String, String>) {
        val id = data["id"]
        val shown = NotificationManagerCompat.from(context).areNotificationsEnabled()
        if (shown) {
            createChannels(context)
            val open = PendingIntent.getActivity(
                context, id.hashCode(),
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra("url", data["url"]),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = NotificationCompat.Builder(context, channelFor(data["tag"]))
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(data["title"] ?: "Magnus")
                .setContentText(data["body"].orEmpty())
                .setStyle(NotificationCompat.BigTextStyle().bigText(data["body"].orEmpty()))
                .setAutoCancel(true)
                .setContentIntent(open)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            try {
                // One per kind, like the web tag: a newer meal reminder replaces the older one.
                NotificationManagerCompat.from(context).notify(data["tag"].orEmpty(), 0, n)
            } catch (_: SecurityException) {
                // Notification permission withdrawn between the check and the post.
            }
        }
        if (id != null) receipt(id, shown)
    }

    /** Tells the server the push reached the phone and whether it showed (health_notifications.received_at). */
    private fun receipt(id: String, shown: Boolean) {
        scope.launch {
            runCatching {
                val body = buildJsonObject {
                    put("id", id)
                    put("shown", shown)
                    if (!shown) put("error", "notifications_off")
                }.toString()
                HttpClient.newCall(
                    Request.Builder().url("${BuildConfig.MAGNUS_ORIGIN}/api/health/push/receipt")
                        .post(body.toRequestBody("application/json".toMediaType())).build(),
                ).execute().close()
            }
        }
    }
}

class MagnusMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) = Push.upload(applicationContext, token)

    override fun onMessageReceived(message: RemoteMessage) = Push.show(applicationContext, message.data)
}
