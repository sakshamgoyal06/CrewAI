package app.magnus.app.ui.you

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import app.magnus.app.AppGraph
import app.magnus.app.data.MagnusJson
import app.magnus.app.health.HealthSync
import app.magnus.app.health.SyncStore
import app.magnus.app.health.SyncWorker
import app.magnus.app.ui.FullScreen
import app.magnus.app.ui.MagnusCard
import app.magnus.app.ui.Screen
import app.magnus.app.ui.coach.str
import app.magnus.app.ui.theme.Magnus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Health Connect, linked in-app: a device token that may only send data in (so a token lifted off
 * the phone can't read anything), then Android's permission screen, then an hourly sync.
 */
@Composable
fun ConnectionsScreen(graph: AppGraph) {
    val c = Magnus.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { SyncStore(context) }
    var version by remember { mutableIntStateOf(0) } // redraw after a change
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    val sdk = remember { HealthConnectClient.getSdkStatus(context) }

    val ask = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        if (granted.any { it in HealthSync.PERMISSIONS }) {
            store.permissionsAsked = HealthSync.PERMISSIONS_VERSION
            SyncWorker.schedule(context)
            SyncWorker.runNow(context)
            note = "Linked. The first sync reads the last 30 days."
        } else {
            note = "No access was given, so nothing will sync."
        }
        version++
    }

    FullScreen(Screen.Connections.title) {
        // Read so the card redraws after link, unlink and permission changes.
        if (version < 0) return@FullScreen
        MagnusCard {
            Text("Health Connect", style = MaterialTheme.typography.titleMedium, color = c.text)
            Text(
                "Steps, workouts, sleep, heart rate, weight and body fat from your phone and watch. Meals from other apps are never read.",
                style = MaterialTheme.typography.bodySmall, color = c.muted,
            )
            val linked = store.token != null
            val last = store.lastSync?.let {
                DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.ENGLISH).format(it.atZone(ZoneId.systemDefault()))
            }
            Text(
                when {
                    sdk != HealthConnectClient.SDK_AVAILABLE -> "Health Connect isn't installed or needs an update."
                    !linked -> "Not linked."
                    last != null -> "Linked · last sync $last"
                    else -> "Linked · first sync pending"
                },
                style = MaterialTheme.typography.bodyMedium, color = if (linked) c.good else c.muted,
            )
            store.lastError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.warn) }
            note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.muted) }

            if (sdk != HealthConnectClient.SDK_AVAILABLE) {
                Action("Get Health Connect") {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")))
                }
            } else if (!linked) {
                Action(if (busy) "Linking…" else "Link Health Connect", enabled = !busy) {
                    busy = true
                    note = null
                    scope.launch {
                        try {
                            // Its own label, so linking Beta doesn't revoke the main app's token.
                            val r = MagnusJson.parseToJsonElement(
                                graph.api.send("POST", "/account/tokens", buildJsonObject { put("label", "Magnus Beta"); put("replace", true) }.toString()),
                            ) as JsonObject
                            store.token = r.str("token")
                            ask.launch(HealthSync.PERMISSIONS + HealthSync.BACKGROUND_PERMISSION)
                        } catch (_: Exception) {
                            note = "Couldn't link it. Check your connection and try again."
                        } finally {
                            busy = false
                        }
                    }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        "Sync now", style = MaterialTheme.typography.labelLarge, color = c.accent,
                        modifier = Modifier.padding(vertical = 6.dp).then(Modifier.clickableNoRipple { SyncWorker.runNow(context); note = "Syncing…" }),
                    )
                    if (store.permissionsAsked < HealthSync.PERMISSIONS_VERSION) Text(
                        "Allow new data", style = MaterialTheme.typography.labelLarge, color = c.accent,
                        modifier = Modifier.padding(vertical = 6.dp).then(Modifier.clickableNoRipple { ask.launch(HealthSync.PERMISSIONS + HealthSync.BACKGROUND_PERMISSION) }),
                    )
                    Text(
                        "Unlink", style = MaterialTheme.typography.labelLarge, color = c.bad,
                        modifier = Modifier.padding(vertical = 6.dp).then(Modifier.clickableNoRipple {
                            SyncWorker.cancel(context)
                            store.clear()
                            note = "Unlinked on this phone."
                            version++
                        }),
                    )
                }
            }
        }
        MagnusCard {
            Text("Hevy", style = MaterialTheme.typography.titleMedium, color = c.text)
            Text("Your Hevy key stays on the server; connect or change it in the main Magnus app for now.", style = MaterialTheme.typography.bodySmall, color = c.muted)
        }
    }
}

@Composable
private fun Action(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    val c = Magnus.colors
    Button(
        onClick = onClick, enabled = enabled, shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.accentInk),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(label, style = MaterialTheme.typography.labelLarge) }
}

private fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)
