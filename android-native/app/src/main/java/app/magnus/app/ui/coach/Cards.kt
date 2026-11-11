@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package app.magnus.app.ui.coach

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.magnus.app.AppGraph
import app.magnus.app.data.MagnusJson
import app.magnus.app.ui.theme.Magnus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val SLOTS = listOf("breakfast" to "Breakfast", "lunch" to "Lunch", "dinner" to "Dinner", "snack" to "Snack")
private val SLOT_LABEL = SLOTS.toMap() + ("unspecified" to "Meal")
private val SKIP_REASONS = listOf("Tired", "Busy", "Sore or injured", "Sick", "Travelling")

private fun fmt(n: Double?): String = n?.roundToInt()?.let { "%,d".format(it) } ?: "0"
private fun r1(n: Double): String = ((n * 10).roundToInt() / 10.0).let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() }

fun clock(hhmm: String?): String {
    if (hhmm.isNullOrBlank()) return ""
    return runCatching { LocalTime.parse(hhmm).format(DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)).lowercase() }.getOrDefault(hhmm)
}

private fun dayName(date: String?): String =
    runCatching { LocalDate.parse(date).dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, Locale.ENGLISH) }.getOrDefault("Today")

private fun shortDay(date: String?): String =
    runCatching { LocalDate.parse(date).let { "${it.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, Locale.ENGLISH)} ${it.dayOfMonth}" } }.getOrDefault("")

/** One card under a coach message. Kinds the app doesn't draw yet show their one-line summary. */
@Composable
fun ChatCard(card: JsonObject, graph: AppGraph) {
    if (card.bool("closed") == true) {
        CardBox { Text(summary(card), style = MaterialTheme.typography.bodyMedium, color = Magnus.colors.text); Quiet(card.str("closedLabel") ?: "Closed") }
        return
    }
    when (card.str("type")) {
        "day_plan" -> DayPlanCard(card)
        "meal_draft" -> MealDraftCard(card, graph)
        "log_receipt" -> LogReceiptCard(card, graph)
        "routine_check" -> CheckCard(card, graph, routine = true)
        "workout_check" -> CheckCard(card, graph, routine = false)
        else -> CardBox {
            Text(summary(card), style = MaterialTheme.typography.bodyMedium, color = Magnus.colors.text)
            Quiet("Open this one in the main Magnus app for now.")
        }
    }
}

@Composable
private fun CardBox(content: @Composable () -> Unit) {
    val c = Magnus.colors
    Column(
        Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(20.dp)).background(c.surface)
            .border(1.dp, c.hair, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

@Composable private fun Eyebrow(t: String) = Text(t.uppercase(), style = MaterialTheme.typography.labelSmall, color = Magnus.colors.faint)
@Composable private fun Quiet(t: String) = Text(t, style = MaterialTheme.typography.bodySmall, color = Magnus.colors.faint)
@Composable private fun Done(t: String, muted: Boolean = false) =
    Text(t, style = MaterialTheme.typography.bodyMedium, color = if (muted) Magnus.colors.muted else Magnus.colors.good)

@Composable
private fun Primary(label: String, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Magnus.colors
    Button(
        onClick = onClick, enabled = enabled, modifier = modifier, shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.accentInk),
    ) { Text(label, style = MaterialTheme.typography.labelLarge) }
}

@Composable
private fun Secondary(label: String, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Magnus.colors
    OutlinedButton(
        onClick = onClick, enabled = enabled, modifier = modifier, shape = RoundedCornerShape(50),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = c.text),
        border = androidx.compose.foundation.BorderStroke(1.dp, c.hair),
    ) { Text(label, style = MaterialTheme.typography.labelLarge) }
}

@Composable
private fun LinkText(label: String, color: androidx.compose.ui.graphics.Color = Magnus.colors.accent, onClick: () -> Unit) =
    Text(label, style = MaterialTheme.typography.labelLarge, color = color, modifier = Modifier.clickable(onClick = onClick).padding(vertical = 4.dp))

@Composable
private fun Chip(label: String, selected: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val c = Magnus.colors
    Text(
        label,
        style = MaterialTheme.typography.labelMedium,
        color = if (selected) c.accentInk else c.text,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (selected) c.accent else c.raised)
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

// ---------- summaries (the PWA's baseSummary) ----------

fun receiptLine(c: JsonObject): String {
    val v = c.obj("value") ?: JsonObject(emptyMap())
    return when (c.str("kind")) {
        "weigh_in" -> listOfNotNull("Weigh-in", v.num("weightKg")?.let { "${r1(it)} kg" }, v.num("bodyFatPct")?.let { "${r1(it)}% body fat" }, v.num("muscleMassKg")?.let { "${r1(it)} kg muscle" }).joinToString(" · ")
        "steps" -> "Steps · ${fmt(v.num("steps"))}"
        "water" -> "Water · ${fmt(v.num("ml"))} ml"
        "meal_removed" -> "Removed meal · ${v.str("text").orEmpty()}"
        "activity_removed" -> "Removed activity · ${v.str("label").orEmpty()} · ${fmt(v.num("durationMin"))} min"
        else -> "Logged"
    }
}

fun summary(c: JsonObject): String {
    fun join(vararg p: String?) = p.filterNot { it.isNullOrBlank() }.joinToString(" · ")
    return when (c.str("type")) {
        "day_plan" -> "${dayName(c.str("date"))}'s plan"
        "meal_draft" -> { val d = c.obj("draft"); join(SLOT_LABEL[d?.str("slot")] ?: "Meal", d?.str("text")) }
        "activity_draft" -> { val d = c.obj("draft"); join(d?.str("label"), d?.num("durationMin")?.let { "${fmt(it)} min" }) }
        "plan_meal" -> join("${SLOT_LABEL[c.str("slot")] ?: "Meal"} on your plan", c.num("kcal")?.let { "${fmt(it)} kcal" })
        "plan_adjust" -> join(if (c.str("kind") == "day_close") "Day close" else "Rest of today", c.str("headline"))
        "workout_check" -> "Workout check"
        "routine_check" -> c.str("label") ?: "Routine check"
        "eating_out" -> join("Eating out", c.str("meal"))
        "intervention" -> c.str("title") ?: "Check-in"
        "rca" -> c.str("hypothesis") ?: "Weekly insight"
        "hevy_proposal" -> "Hevy change"
        "calorie_review" -> "Calorie review"
        "pause_resume" -> "Restart after your pause"
        "log_receipt" -> receiptLine(c)
        else -> "Card"
    }
}

// ---------- the day's plan ----------

@Composable
private fun DayPlanCard(c: JsonObject) {
    val m = Magnus.colors
    CardBox {
        Eyebrow("${dayName(c.str("date"))}'s plan")
        val plan = c.arr("plan")
        if (plan.isNotEmpty()) {
            for (p in plan) Row {
                Text(p.str("time") ?: "Any time", style = MaterialTheme.typography.bodySmall, color = m.muted, modifier = Modifier.width(76.dp))
                Text(p.str("label").orEmpty(), style = MaterialTheme.typography.bodyMedium, color = m.text)
            }
        } else c.str("dayKind")?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = m.text) }
        val targets = c.arr("targets")
        if (targets.isNotEmpty()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            for (t in targets) Column {
                Text(t.str("value").orEmpty(), style = MaterialTheme.typography.titleMedium, color = m.text)
                Text(t.str("label").orEmpty(), style = MaterialTheme.typography.bodySmall, color = m.muted)
            }
        }
        c.str("focus")?.let {
            Text(androidx.compose.ui.text.buildAnnotatedString {
                pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Bold)); append("Worth a look "); pop(); append(it)
            }, style = MaterialTheme.typography.bodyMedium, color = m.text)
        }
    }
}

// ---------- a meal the coach worked out ----------

@Composable
private fun MealDraftCard(c: JsonObject, graph: AppGraph) {
    val m = Magnus.colors
    val d = c.obj("draft") ?: return
    val draftId = d.str("draftId").orEmpty()
    val scope = rememberCoroutineScope()
    var logged by remember(c) { mutableStateOf(c.obj("saved")?.num("calories")) }
    var discarded by remember(c) { mutableStateOf(graph.chat.isDiscarded(draftId)) }
    val unsure = d.bool("slotUnsure") == true
    val first = d.str("slot")?.takeIf { s -> SLOTS.any { it.first == s } } ?: "snack"
    var slot by remember(c) { mutableStateOf(if (unsure) null else first) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val items = d.arr("items")
    val text = d.str("text").orEmpty()

    CardBox {
        when {
            logged != null -> Done("✓ ${SLOT_LABEL[slot ?: first] ?: "Meal"} · $text · ${fmt(logged)} kcal")
            discarded -> Done("Discarded · $text", muted = true)
            else -> {
                if (slot == null) {
                    Text("Which meal was this?", style = MaterialTheme.typography.bodyMedium, color = m.text)
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((k, label) in SLOTS) Chip(label, selected = slot == k) { slot = k }
                }
                val kcal = items.sumOf { it.num("calories") ?: 0.0 }
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(fmt(kcal), style = MaterialTheme.typography.headlineSmall, color = m.text)
                    Text(" kcal", style = MaterialTheme.typography.bodySmall, color = m.muted, modifier = Modifier.padding(bottom = 4.dp))
                }
                Text(
                    "${r1(items.sumOf { it.num("protein_g") ?: 0.0 })} g protein · ${r1(items.sumOf { it.num("carbs_g") ?: 0.0 })} g carbs · ${r1(items.sumOf { it.num("fat_g") ?: 0.0 })} g fat",
                    style = MaterialTheme.typography.bodySmall, color = m.muted,
                )
                d.str("servingAssumption")?.let { Quiet(it) }
                val blank = items.filter { it.bool("missing") == true && (it.num("calories") ?: 0.0) <= 0.0 }
                for (i in items) Row(Modifier.fillMaxWidth()) {
                    Text(i.str("name") ?: "Unnamed", style = MaterialTheme.typography.bodyMedium, color = m.text, modifier = Modifier.weight(1f))
                    val missing = i.bool("missing") == true && (i.num("calories") ?: 0.0) <= 0.0
                    Text(
                        if (missing) "needs numbers" else "${fmt(i.num("calories"))} kcal · ${r1(i.num("protein_g") ?: 0.0)} g P",
                        style = MaterialTheme.typography.bodySmall, color = if (missing) m.warn else m.muted,
                    )
                }
                if (blank.isNotEmpty() || kcal <= 0) Quiet("No numbers for ${blank.joinToString { it.str("name").orEmpty() }.ifBlank { "this" }} yet. Edit it in the main Magnus app for now.")
                error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = m.bad) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    LinkText("Discard", m.muted) { graph.chat.discard(draftId); discarded = true }
                    Primary(if (busy) "Logging…" else "Confirm & log", enabled = !busy && slot != null && items.isNotEmpty() && kcal > 0 && blank.isEmpty()) {
                        val s = slot ?: return@Primary
                        busy = true
                        error = null
                        scope.launch {
                            try {
                                val body = buildJsonObject {
                                    put("draftId", draftId)
                                    put("text", text)
                                    put("slot", s)
                                    put("source", d.str("source") ?: "llm")
                                    put("items", buildJsonArray {
                                        for (i in items) add(buildJsonObject {
                                            put("name", i.str("name").orEmpty().trim())
                                            put("calories", i.num("calories") ?: 0.0)
                                            put("protein_g", i.num("protein_g") ?: 0.0)
                                            put("carbs_g", i.num("carbs_g") ?: 0.0)
                                            put("fat_g", i.num("fat_g") ?: 0.0)
                                        })
                                    })
                                    put("edited", !unsure && s != d.str("slot"))
                                    d.str("date")?.let { put("date", it) }
                                    if (d.bool("extra") == true && (unsure || s == d.str("slot"))) put("extra", true)
                                }
                                val r = MagnusJson.parseToJsonElement(graph.api.send("POST", "/meals/confirm", body.toString())) as JsonObject
                                logged = r.obj("totals")?.num("calories") ?: kcal
                                graph.chat.cardChanged()
                            } catch (e: Exception) {
                                error = "Couldn't log it. Try again."
                            } finally {
                                busy = false
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------- what the coach logged straight from chat ----------

@Composable
private fun LogReceiptCard(c: JsonObject, graph: AppGraph) {
    val scope = rememberCoroutineScope()
    var cur by remember(c) { mutableStateOf(c) }
    var busy by remember { mutableStateOf(false) }
    val today = LocalDate.now().toString()
    val day = cur.str("date")?.takeIf { it != today }?.let { " · ${shortDay(it)}" }.orEmpty()
    val removed = cur.str("kind") == "meal_removed" || cur.str("kind") == "activity_removed"
    CardBox {
        if (cur.str("state") == "undone") {
            Done("Undone · ${receiptLine(cur)}$day", muted = true)
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${if (removed) "" else "✓ "}${receiptLine(cur)}$day${if (cur.str("state") == "edited") " · changed" else ""}",
                    style = MaterialTheme.typography.bodyMedium, color = if (removed) Magnus.colors.muted else Magnus.colors.good,
                    modifier = Modifier.weight(1f),
                )
                val id = cur.str("receiptId")
                if (id != null) LinkText(if (busy) "…" else "Undo") {
                    if (busy) return@LinkText
                    busy = true
                    scope.launch {
                        try {
                            val r = MagnusJson.parseToJsonElement(graph.api.send("POST", "/chat/receipts/$id/undo")) as JsonObject
                            cur = r.obj("card") ?: JsonObject(cur + ("state" to kotlinx.serialization.json.JsonPrimitive("undone")))
                            graph.chat.cardChanged()
                        } catch (_: Exception) {
                        } finally {
                            busy = false
                        }
                    }
                }
            }
        }
    }
}

// ---------- routine and workout follow-ups ----------

@Composable
private fun CheckCard(c: JsonObject, graph: AppGraph, routine: Boolean) {
    val m = Magnus.colors
    val scope = rememberCoroutineScope()
    var status by remember(c) { mutableStateOf(c.str("status") ?: "missing") }
    var reason by remember(c) { mutableStateOf(c.str("reason")) }
    var showReasons by remember { mutableStateOf(false) }
    var other by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    val date = c.str("date").orEmpty()
    val day = shortDay(date)
    val label = c.str("label") ?: "Workout"
    val minutes = c.num("durationMin")
    val hevy = c.bool("hevy") != false

    fun answer(answer: String, why: String? = null) {
        busy = true
        note = null
        scope.launch {
            try {
                val body = buildJsonObject {
                    if (routine) put("itemId", c.str("itemId").orEmpty())
                    put("date", date)
                    put("answer", answer)
                    why?.let { put("reason", it) }
                }.toString()
                val r = MagnusJson.parseToJsonElement(graph.api.send("POST", if (routine) "/routine/check" else "/workout-check", body)) as JsonObject
                val st = r.str("status") ?: if (answer == "undo") "missing" else answer
                if (st == "missing" && answer != "undo") {
                    note = if (routine) "Nothing logged for it yet." else "Still nothing in Hevy for that day."
                } else {
                    status = st
                    reason = why
                    showReasons = false
                    graph.chat.cardChanged()
                }
            } catch (_: Exception) {
                note = "Couldn't save that. Try again."
            } finally {
                busy = false
            }
        }
    }

    CardBox {
        if (status != "missing") {
            val line = when {
                routine && status == "done" -> "✓ $label${minutes?.let { " · ${fmt(it)} min" }.orEmpty()} · $day"
                routine -> "Skipped ${label.lowercase()}${reason?.let { " · $it" }.orEmpty()} · $day"
                status == "found" && reason != null -> "✓ $reason counted as training · $day"
                status == "found" -> "✓ Workout found in Hevy · $day"
                status == "trained_unlogged" -> "${if (hevy) "✓ Trained, not logged in Hevy" else "✓ Trained"} · $day"
                else -> "Skipped${reason?.let { " · $it" }.orEmpty()} · $day"
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Done(line, muted = status == "skipped")
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                    // An answer they gave (not one Hevy settled) can be undone.
                    if (routine || status == "skipped" || status == "trained_unlogged") LinkText("Undo") { if (!busy) answer("undo") }
                }
            }
            return@CardBox
        }
        Eyebrow(if (routine) "Routine · $day" else "Workout check · $day")
        Text(
            if (routine) "$label${c.str("startTime")?.let { " at ${clock(it)}" }.orEmpty()}: nothing logged yet."
            else if (!hevy) "Did you train after your ${clock(c.str("gymTime"))} slot?"
            else "Nothing in Hevy after your ${clock(c.str("gymTime"))} slot.",
            style = MaterialTheme.typography.bodyMedium, color = m.text,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (routine) {
                Primary("Done${minutes?.let { " · ${fmt(it)} min" }.orEmpty()}", enabled = !busy) { answer("done") }
            } else {
                if (hevy) Secondary("Check Hevy again", enabled = !busy) { answer("recheck") }
                Secondary(if (hevy) "Trained, didn't log" else "Trained", enabled = !busy) { answer("trained_unlogged") }
            }
            Secondary("Skipped", enabled = !busy) { showReasons = !showReasons }
        }
        if (showReasons) {
            Quiet("What got in the way? This feeds the weekly review.")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (r in SKIP_REASONS) Chip(r, enabled = !busy) { answer("skipped", r) }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(other, { other = it.take(300) }, placeholder = { Text("Other reason") }, singleLine = true, modifier = Modifier.weight(1f))
                Secondary("Save", enabled = !busy) { answer("skipped", other.trim().ifBlank { null }) }
            }
        }
        note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = m.warn) }
    }
}
