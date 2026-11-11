package app.magnus.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.magnus.app.AppGraph
import app.magnus.app.data.MagnusJson
import app.magnus.app.ui.coach.arr
import app.magnus.app.ui.coach.num
import app.magnus.app.ui.coach.obj
import app.magnus.app.ui.coach.str
import app.magnus.app.ui.theme.Magnus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.roundToInt

/** A screen over the tabs: back arrow, title, its content. */
@Composable
fun FullScreen(title: String, content: @Composable () -> Unit) {
    val nav = LocalNav.current
    val c = Magnus.colors
    Column(Modifier.fillMaxSize().background(c.bg).navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                MagnusIcons.Back, contentDescription = "Back", tint = c.text,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable { nav.back() }.padding(12.dp).size(24.dp),
            )
            Text(title, style = MaterialTheme.typography.titleLarge, color = c.text)
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) { content() }
    }
}

@Composable
private fun SaveButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    val c = Magnus.colors
    Button(
        onClick = onClick, enabled = enabled, shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.accentInk),
        modifier = Modifier.fillMaxWidth().height(52.dp),
    ) { Text(label, style = MaterialTheme.typography.labelLarge) }
}

private fun numberOrNull(s: String): Double? = s.trim().replace(',', '.').toDoubleOrNull()

/**
 * Log a meal: say it in your own words (the coach works out the numbers and shows the card to
 * confirm), or one tap on a meal you have often. The food search with grams comes next.
 */
@Composable
fun LogMealScreen(graph: AppGraph) {
    val nav = LocalNav.current
    val c = Magnus.colors
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var usual by remember { mutableStateOf<List<JsonObject>?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        usual = runCatching {
            (MagnusJson.parseToJsonElement(graph.api.getText("/meals/usual")) as JsonObject).arr("meals")
        }.getOrDefault(emptyList())
    }
    fun toCoach() {
        nav.closeAll()
        nav.tab = Tab.Coach
    }

    FullScreen(Screen.LogMeal.title) {
        OutlinedTextField(
            value = text, onValueChange = { text = it.take(500) },
            label = { Text("What did you eat?") },
            placeholder = { Text("2 roti, dal and a bowl of curd for lunch") },
            minLines = 2, modifier = Modifier.fillMaxWidth(),
        )
        SaveButton("Work it out", enabled = text.isNotBlank() && !busy) {
            graph.chat.send(text)
            toCoach()
        }
        Text("The coach shows the meal as a card to check, then you confirm it.", style = MaterialTheme.typography.bodySmall, color = c.faint)

        val list = usual
        if (list == null) {
            Text("Loading your usual meals…", style = MaterialTheme.typography.bodySmall, color = c.faint)
        } else if (list.isNotEmpty()) {
            Text("Your usual", style = MaterialTheme.typography.titleMedium, color = c.text, modifier = Modifier.padding(top = 8.dp))
            MagnusCard {
                for (m in list) {
                    val kcal = m.obj("totals")?.num("calories") ?: 0.0
                    Row(
                        Modifier.fillMaxWidth().clickable(enabled = !busy) {
                            busy = true
                            scope.launch {
                                try {
                                    graph.api.send("POST", "/meals/repeat", buildJsonObject { put("key", m.str("key").orEmpty()) }.toString())
                                    graph.chat.refresh()
                                    toCoach()
                                } catch (_: Exception) {
                                    nav.say("Couldn't open that meal. Try again.")
                                } finally {
                                    busy = false
                                }
                            }
                        }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(m.str("text").orEmpty(), style = MaterialTheme.typography.bodyMedium, color = c.text, maxLines = 2)
                            Text((m.str("slot") ?: "").replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall, color = c.muted)
                        }
                        Text("${kcal.roundToInt()} kcal", style = MaterialTheme.typography.labelMedium, color = c.muted)
                    }
                }
            }
        }
    }
}

@Composable
fun WeighInScreen(graph: AppGraph) {
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var weight by remember { mutableStateOf("") }
    var fat by remember { mutableStateOf("") }
    var muscle by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val w = numberOrNull(weight)
    val f = numberOrNull(fat)
    val m = numberOrNull(muscle)
    val valid = (w != null || f != null || m != null) &&
        (w == null || w in 25.0..350.0) && (f == null || f in 2.0..70.0) && (m == null || m in 10.0..150.0)

    FullScreen(Screen.WeighIn.title) {
        val kb = KeyboardOptions(keyboardType = KeyboardType.Decimal)
        OutlinedTextField(weight, { weight = it }, label = { Text("Weight (kg)") }, singleLine = true, keyboardOptions = kb, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(fat, { fat = it }, label = { Text("Body fat % (optional)") }, singleLine = true, keyboardOptions = kb, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(muscle, { muscle = it }, label = { Text("Muscle mass kg (optional)") }, singleLine = true, keyboardOptions = kb, modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = Magnus.colors.bad, style = MaterialTheme.typography.bodySmall) }
        SaveButton(if (busy) "Saving…" else "Save", enabled = valid && !busy) {
            busy = true
            scope.launch {
                try {
                    val body = buildJsonObject {
                        w?.let { put("weightKg", it) }
                        f?.let { put("bodyFatPct", it) }
                        m?.let { put("muscleMassKg", it) }
                    }.toString()
                    val queued = app.magnus.app.data.Outbox.isQueued(graph.api.send("POST", "/checkins", body))
                    graph.chat.cardChanged()
                    if (!queued) nav.say("Weigh-in saved.")
                    nav.back()
                } catch (_: Exception) {
                    error = "Couldn't save it. Check your connection and try again."
                } finally {
                    busy = false
                }
            }
        }
    }
}

@Composable
fun StepsScreen(graph: AppGraph) {
    val nav = LocalNav.current
    val c = Magnus.colors
    val scope = rememberCoroutineScope()
    var steps by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val n = steps.trim().toIntOrNull()

    FullScreen(Screen.Steps.title) {
        Text("Steps sync from Health Connect once it's linked. Use this for a day it missed.", style = MaterialTheme.typography.bodySmall, color = c.faint)
        OutlinedTextField(steps, { steps = it.filter(Char::isDigit).take(6) }, label = { Text("Steps today") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = c.bad, style = MaterialTheme.typography.bodySmall) }
        SaveButton(if (busy) "Saving…" else "Save", enabled = n != null && n in 0..200_000 && !busy) {
            busy = true
            scope.launch {
                try {
                    val queued = app.magnus.app.data.Outbox.isQueued(
                        graph.api.send("POST", "/steps", buildJsonObject { put("steps", n ?: 0); put("source", "manual") }.toString()),
                    )
                    graph.chat.cardChanged()
                    if (!queued) nav.say("Steps saved.")
                    nav.back()
                } catch (_: Exception) {
                    error = "Couldn't save them. Check your connection and try again."
                } finally {
                    busy = false
                }
            }
        }
    }
}
