package app.magnus.app.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.magnus.app.AppGraph
import app.magnus.app.data.ApiException
import app.magnus.app.data.WhoAmI
import app.magnus.app.ui.coach.CoachScreen
import app.magnus.app.ui.signin.SignInScreen
import app.magnus.app.ui.today.TodayScreen
import app.magnus.app.ui.you.ConnectionsScreen
import app.magnus.app.ui.you.YouScreen
import app.magnus.app.ui.theme.Magnus

enum class Tab(val label: String, val icon: ImageVector) {
    Coach("Coach", MagnusIcons.Coach),
    Today("Today", MagnusIcons.Today),
    Meals("Meals", MagnusIcons.Meals),
    Progress("Progress", MagnusIcons.Progress),
    You("You", MagnusIcons.You),
}

@Composable
fun MagnusRoot(graph: AppGraph) {
    val c = Magnus.colors
    // Status and navigation bar icons follow the app's theme, not only the phone's.
    val view = LocalView.current
    val lightBg = c.bg.luminance() > 0.5f
    SideEffect {
        (view.context as? Activity)?.window?.let { w ->
            WindowCompat.getInsetsController(w, view).apply {
                isAppearanceLightStatusBars = lightBg
                isAppearanceLightNavigationBars = lightBg
            }
        }
    }

    val session by graph.auth.session.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(c.bg)) {
        if (session == null) SignInScreen(graph) else SignedIn(graph)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SignedIn(graph: AppGraph) {
    val c = Magnus.colors
    val nav = remember { Navigator() }
    BackHandler(enabled = nav.logSheet || nav.stack.isNotEmpty() || nav.tab != Tab.Coach) { nav.back() }

    // Whose account this is: an uninvited Google account is refused here (403 signup_closed),
    // the same rule as the PWA, and goes back to sign-in with the reason.
    LaunchedEffect(Unit) {
        try {
            graph.api.get("/whoami", WhoAmI.serializer())
        } catch (e: ApiException) {
            if (e.code == "signup_closed" || e.status == 401) {
                graph.signInNotice.value = if (e.code == "signup_closed") {
                    "This Google account isn't invited to Magnus yet. Ask Saksham for an invite."
                } else {
                    "That sign-in didn't work. Try again."
                }
                graph.signOut()
            }
        } catch (_: Exception) {
            // Offline: keep the session; screens show what they have saved.
        }
    }

    val context = androidx.compose.ui.platform.LocalContext.current

    // Offline logs: say when one is kept or sent, and send what's waiting on every open.
    LaunchedEffect(Unit) {
        graph.outbox.events.collect { note ->
            nav.say(note)
            if (note != app.magnus.app.data.Outbox.SAVED) graph.chat.cardChanged()
        }
    }
    LaunchedEffect(Unit) {
        if (graph.outbox.size() > 0 && !graph.outbox.flush(graph.api)) app.magnus.app.data.Outbox.schedule(context)
    }

    // Push: ask once for the notification permission (Android 13+), then register this install.
    val askNotify = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { app.magnus.app.push.Push.register(context) }
    LaunchedEffect(Unit) {
        val prefs = context.getSharedPreferences("magnus-ui", android.content.Context.MODE_PRIVATE)
        if (android.os.Build.VERSION.SDK_INT >= 33 && app.magnus.app.push.Push.configured() && !prefs.getBoolean("asked-notify", false)) {
            prefs.edit().putBoolean("asked-notify", true).apply()
            askNotify.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        } else {
            app.magnus.app.push.Push.register(context)
        }
    }

    CompositionLocalProvider(LocalNav provides nav) {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().statusBarsPadding()) {
                val top = nav.stack.lastOrNull()
                if (top != null) {
                    when (top) {
                        Screen.LogMeal -> LogMealScreen(graph)
                        Screen.WeighIn -> WeighInScreen(graph)
                        Screen.Steps -> StepsScreen(graph)
                        Screen.Connections -> ConnectionsScreen(graph)
                    }
                } else {
                    Box(Modifier.weight(1f).fillMaxWidth()) {
                        when (nav.tab) {
                            Tab.Coach -> CoachScreen(graph)
                            Tab.Today -> TodayScreen(graph)
                            Tab.Meals -> EmptyNote("Meals", "The meal plan arrives in a later Beta build. Use the main Magnus app for it until then.")
                            Tab.Progress -> EmptyNote("Progress", "Trends and the goal chart arrive in a later Beta build.")
                            Tab.You -> YouScreen(graph)
                        }
                    }
                    // The tab bar steps aside while the keyboard is up, so nothing crowds the composer.
                    if (!WindowInsets.isImeVisible) {
                        HorizontalDivider(color = c.hair)
                        Row(
                            Modifier.fillMaxWidth().background(c.bg).navigationBarsPadding().height(64.dp),
                            horizontalArrangement = Arrangement.SpaceAround,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            for (t in Tab.entries) TabButton(t, selected = t == nav.tab) { nav.tab = t }
                        }
                    }
                }
            }
            if (nav.logSheet) LogSheet(graph)
            Toast(nav)
        }
    }
}

/** A short line at the top (never over the composer), gone after a few seconds. */
@Composable
private fun Toast(nav: Navigator) {
    val c = Magnus.colors
    val text = nav.toast ?: return
    LaunchedEffect(text) {
        kotlinx.coroutines.delay(2800)
        nav.toast = null
    }
    Box(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp), contentAlignment = Alignment.TopCenter) {
        Text(
            text, style = MaterialTheme.typography.bodyMedium, color = c.text,
            modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(50)).background(c.raised)
                .padding(horizontal = 18.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabButton(t: Tab, selected: Boolean, onClick: () -> Unit) {
    val c = Magnus.colors
    val tint = if (selected) c.accent else c.faint
    Column(
        Modifier
            .weight(1f)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(t.icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        Text(t.label, style = MaterialTheme.typography.labelSmall, color = tint, modifier = Modifier.padding(top = 2.dp))
    }
}
