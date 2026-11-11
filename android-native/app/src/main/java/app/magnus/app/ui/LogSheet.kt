package app.magnus.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.magnus.app.AppGraph
import app.magnus.app.ui.theme.Magnus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The + Log picker: one short row of round icons, the only bottom sheet in the app (it stays
 * under a quarter of the screen). Each tile opens its own screen or logs in one tap.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogSheet(graph: AppGraph) {
    val nav = LocalNav.current
    val c = Magnus.colors
    val scope = rememberCoroutineScope()
    ModalBottomSheet(
        onDismissRequest = { nav.logSheet = false },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = c.surface,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 20.dp)) {
            Text("Log", style = MaterialTheme.typography.titleMedium, color = c.text, modifier = Modifier.padding(bottom = 16.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Tile("Meal", MagnusIcons.Meal) { nav.open(Screen.LogMeal) }
                Tile("Steps", MagnusIcons.Steps) { nav.open(Screen.Steps) }
                Tile("Weigh-in", MagnusIcons.Scale) { nav.open(Screen.WeighIn) }
                Tile("Water", MagnusIcons.Water) {
                    nav.logSheet = false
                    scope.launch {
                        try {
                            graph.api.send("POST", "/water", buildJsonObject { put("ml", 250) }.toString())
                            graph.chat.cardChanged()
                            nav.say("Added a glass of water.")
                        } catch (_: Exception) {
                            nav.say("Couldn't add water. Check your connection.")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Tile(label: String, icon: ImageVector, onClick: () -> Unit) {
    val c = Magnus.colors
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = onClick).padding(4.dp)) {
        Box(Modifier.size(56.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = c.accent)
        }
        Text(label, style = MaterialTheme.typography.labelMedium, color = c.text, modifier = Modifier.padding(top = 6.dp))
    }
}
