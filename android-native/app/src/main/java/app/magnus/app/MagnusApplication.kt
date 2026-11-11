package app.magnus.app

import android.app.Application
import android.content.Context
import app.magnus.app.auth.AuthRepository
import app.magnus.app.data.Api
import app.magnus.app.data.ChatStore
import app.magnus.app.data.TodayRepository
import app.magnus.app.ui.theme.ThemeChoice
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** One of each long-lived object; screens reach them through `appGraph`. */
class AppGraph(context: Context) {
    val auth = AuthRepository(context)
    val api = Api(auth)
    val today = TodayRepository(context, api)
    val chat = ChatStore(context, api)
    val outbox = app.magnus.app.data.Outbox(context).also { api.outbox = it }

    private val prefs = context.getSharedPreferences("magnus-ui", Context.MODE_PRIVATE)
    private val _theme = MutableStateFlow(
        runCatching { ThemeChoice.valueOf(prefs.getString("theme", null) ?: "System") }.getOrDefault(ThemeChoice.System),
    )
    val theme: StateFlow<ThemeChoice> = _theme

    fun setTheme(choice: ThemeChoice) {
        prefs.edit().putString("theme", choice.name).apply()
        _theme.value = choice
    }

    /** Shown on the sign-in screen after a session ends for a reason the person should know. */
    val signInNotice = MutableStateFlow<String?>(null)

    fun signOut() {
        auth.signOut()
        today.clear()
        chat.clear()
        outbox.clear()
    }
}

class MagnusApplication : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        // Keep the hourly Health Connect sync scheduled once this phone is linked.
        if (app.magnus.app.health.SyncStore(this).token != null) app.magnus.app.health.SyncWorker.schedule(this)
    }
}

val Context.appGraph: AppGraph get() = (applicationContext as MagnusApplication).graph
