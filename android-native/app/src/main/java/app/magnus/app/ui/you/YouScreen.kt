package app.magnus.app.ui.you

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.magnus.app.AppGraph
import app.magnus.app.BuildConfig
import app.magnus.app.data.WhoAmI
import app.magnus.app.ui.MagnusCard
import app.magnus.app.ui.theme.Magnus
import app.magnus.app.ui.theme.ThemeChoice

@Composable
fun YouScreen(graph: AppGraph) {
    val c = Magnus.colors
    var me by remember { mutableStateOf<WhoAmI?>(null) }
    LaunchedEffect(Unit) { me = runCatching { graph.api.get("/whoami", WhoAmI.serializer()) }.getOrNull() }
    val theme by graph.theme.collectAsStateWithLifecycle()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("You", style = MaterialTheme.typography.headlineSmall, color = c.text)
        MagnusCard {
            Text(me?.name ?: "Signed in", style = MaterialTheme.typography.titleMedium, color = c.text)
            me?.email?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.muted) }
        }
        val nav = app.magnus.app.ui.LocalNav.current
        MagnusCard {
            Text(
                "Connections", style = MaterialTheme.typography.titleMedium, color = c.text,
                modifier = Modifier.fillMaxWidth().clickable { nav.open(app.magnus.app.ui.Screen.Connections) }.padding(vertical = 4.dp),
            )
            Text("Health Connect and Hevy", style = MaterialTheme.typography.bodySmall, color = c.muted)
        }
        MagnusCard {
            Text("Theme", style = MaterialTheme.typography.titleMedium, color = c.text)
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                for (t in ThemeChoice.entries) {
                    Text(
                        t.name,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (t == theme) c.accent else c.muted,
                        modifier = Modifier.clickable { graph.setTheme(t) }.padding(vertical = 6.dp),
                    )
                }
            }
        }
        MagnusCard {
            val context = androidx.compose.ui.platform.LocalContext.current
            Text(
                "Sign out",
                style = MaterialTheme.typography.labelLarge,
                color = c.bad,
                modifier = Modifier.fillMaxWidth().clickable {
                    // Signing out stops this phone's sync too; the token is revoked by linking again.
                    app.magnus.app.health.SyncWorker.cancel(context)
                    app.magnus.app.health.SyncStore(context).clear()
                    graph.signOut()
                }.padding(vertical = 6.dp),
            )
        }
        Text("Magnus Beta ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall, color = c.faint)
    }
}
