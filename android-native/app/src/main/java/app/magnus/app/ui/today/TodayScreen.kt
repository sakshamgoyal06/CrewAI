package app.magnus.app.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.TextButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.magnus.app.AppGraph
import app.magnus.app.data.ApiException
import app.magnus.app.ui.LocalNav
import app.magnus.app.data.DayCheck
import app.magnus.app.data.DayMealRow
import app.magnus.app.data.ScoreDay
import app.magnus.app.data.TodayRepository
import app.magnus.app.data.TodaySnapshot
import app.magnus.app.ui.Bar
import app.magnus.app.ui.EmptyNote
import app.magnus.app.ui.MagnusCard
import app.magnus.app.ui.theme.Magnus
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val dayTitle = DateTimeFormatter.ofPattern("EEEE, d MMM", Locale.ENGLISH)
private val clock = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)
private val PLAN_SLOTS = setOf("breakfast", "lunch", "snack", "dinner")
private val nf = NumberFormat.getIntegerInstance(Locale("en", "IN"))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(graph: AppGraph) {
    val c = Magnus.colors
    val scope = rememberCoroutineScope()
    // The saved copy first, so the screen opens at once (and offline); then a fresh one.
    var loaded by remember { mutableStateOf(graph.today.cached()) }
    var refreshing by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    suspend fun refresh() {
        refreshing = true
        try {
            loaded = graph.today.refresh()
            failed = false
        } catch (_: Exception) {
            failed = true
        } finally {
            refreshing = false
        }
    }
    LaunchedEffect(Unit) { refresh() }
    val nav = LocalNav.current
    // "Ate this" more than an hour before the meal's time asks once (the server's too_early rule).
    var early by remember { mutableStateOf<DayMealRow?>(null) }
    early?.let { row ->
        AlertDialog(
            onDismissRequest = { early = null },
            title = { Text("Already ate your ${row.slot}?") },
            text = { Text("It's planned for later. Log it now anyway?") },
            confirmButton = {
                TextButton(onClick = {
                    early = null
                    scope.launch {
                        runCatching { graph.api.send("POST", "/diet/days/${loaded?.snapshot?.today?.date}/${row.slot}/eat", "{\"early\":true}") }
                            .onSuccess { nav.say("Logged your ${row.slot}.") }
                            .onFailure { nav.say("Couldn't save that. Try again.") }
                        refresh()
                    }
                }) { Text("Log it") }
            },
            dismissButton = { TextButton(onClick = { early = null }) { Text("Not yet") } },
        )
    }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refresh() } }, modifier = Modifier.fillMaxSize()) {
        val l = loaded
        when {
            l != null -> TodayContent(l, offline = failed, onMeal = { row, action ->
                scope.launch {
                    val path = "/diet/days/${l.snapshot.today.date}/${row.slot}/$action"
                    try {
                        graph.api.send("POST", path, "{}")
                        nav.say(if (action == "eat") "Logged your ${row.slot}." else "Marked ${row.slot} as skipped.")
                    } catch (e: ApiException) {
                        if (e.code == "too_early") {
                            early = row
                        } else {
                            nav.say(if (e.code == "already_logged") "Already logged." else "Couldn't save that. Try again.")
                        }
                    } catch (_: Exception) {
                        nav.say("No connection. Try again when you're online.")
                    }
                    refresh()
                }
            })
            failed -> Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                EmptyNote("Can't reach Magnus", "Check your connection, then pull down to try again.")
            }
            else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
        }
    }
}

@Composable
private fun TodayContent(l: TodayRepository.Loaded, offline: Boolean, onMeal: (DayMealRow, String) -> Unit) {
    val c = Magnus.colors
    val s = l.snapshot
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val date = runCatching { LocalDate.parse(s.today.date) }.getOrNull() ?: LocalDate.now()
        Column {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(dayTitle.format(date), style = MaterialTheme.typography.headlineSmall, color = c.text, modifier = Modifier.weight(1f))
                val nav = LocalNav.current
                Text(
                    "+ Log", style = MaterialTheme.typography.labelLarge, color = c.accent,
                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { nav.logSheet = true }.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
            if (offline) {
                val at = clock.format(Instant.ofEpochMilli(l.savedAt).atZone(ZoneId.systemDefault()))
                Text("Offline · showing $at", style = MaterialTheme.typography.bodySmall, color = c.warn)
            }
        }
        Scorecard(s)
        Checks(s.today.checks)
        Food(s, onMeal)
        Movement(s)
    }
}

/** The north star: on-track days this week against the goal, with the 7-day strip. */
@Composable
private fun Scorecard(s: TodaySnapshot) {
    val c = Magnus.colors
    val ns = s.northStar
    val status = when {
        s.today.paused -> "Paused today"
        s.today.onTrack -> "On track today"
        s.today.unlogged -> "Not logged yet"
        else -> "${s.today.score.roundToInt()}% of today done"
    }
    MagnusCard {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("${ns.onTrackDays}", style = MaterialTheme.typography.displaySmall, color = c.text)
            Text(" / ${ns.goal} on-track days this week", style = MaterialTheme.typography.bodyMedium, color = c.muted, modifier = Modifier.padding(bottom = 6.dp))
        }
        Text(status, style = MaterialTheme.typography.titleSmall, color = if (s.today.onTrack) c.good else c.accent)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            for (d in ns.days.takeLast(7)) DayMark(d, isToday = d.date == s.today.date)
        }
    }
}

/** Same three marks as the PWA's day strip: on track, some, not logged (a dash). */
@Composable
private fun DayMark(d: ScoreDay, isToday: Boolean) {
    val c = Magnus.colors
    val letter = runCatching { LocalDate.parse(d.date).dayOfWeek.name.take(1) }.getOrDefault("")
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(letter, style = MaterialTheme.typography.labelSmall, color = if (isToday) c.text else c.faint)
        Box(Modifier.padding(top = 6.dp).size(28.dp), contentAlignment = Alignment.Center) {
            when {
                d.paused -> Box(Modifier.size(10.dp).clip(CircleShape).background(c.hair))
                d.onTrack -> Box(Modifier.size(22.dp).clip(CircleShape).background(c.accent))
                d.unlogged -> Box(Modifier.width(12.dp).height(2.dp).background(c.faint))
                else -> Box(Modifier.size(22.dp).clip(CircleShape).border(2.dp, c.accent.copy(alpha = 0.5f), CircleShape))
            }
        }
    }
}

@Composable
private fun Checks(checks: List<DayCheck>) {
    if (checks.isEmpty()) return
    val c = Magnus.colors
    MagnusCard {
        Text("Today's checks", style = MaterialTheme.typography.titleMedium, color = c.text)
        for (ch in checks) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(ch.label, style = MaterialTheme.typography.bodyMedium, color = c.text)
                    Text(if (ch.met) "Done" else "${(ch.progress * 100).roundToInt()}%", style = MaterialTheme.typography.labelMedium, color = if (ch.met) c.good else c.muted)
                }
                Bar(ch.progress.toFloat(), if (ch.met) c.good else c.accent)
                if (ch.detail.isNotBlank()) Text(ch.detail, style = MaterialTheme.typography.bodySmall, color = c.faint)
            }
        }
    }
}

@Composable
private fun Food(s: TodaySnapshot, onMeal: (DayMealRow, String) -> Unit) {
    val c = Magnus.colors
    val meals = s.mealList
    val eaten = meals?.eaten?.kcal ?: s.today.calories
    val protein = meals?.eaten?.proteinG ?: s.today.proteinG
    MagnusCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Text("Food", style = MaterialTheme.typography.titleMedium, color = c.text)
            val target = s.targets.calorieTarget
            Text(
                if (target != null) "${nf.format(eaten.roundToInt())} of ${nf.format(target.roundToInt())} kcal" else "${nf.format(eaten.roundToInt())} kcal",
                style = MaterialTheme.typography.bodyMedium, color = c.muted,
            )
        }
        s.targets.calorieTarget?.let { Bar((eaten / it).toFloat(), c.accent) }
        s.targets.proteinTarget?.let {
            Text("Protein ${protein.roundToInt()} of ${it.roundToInt()} g", style = MaterialTheme.typography.bodySmall, color = c.muted)
            Bar((protein / it).toFloat(), c.protein, height = 4.dp)
        }
        val rows = meals?.rows.orEmpty()
        if (rows.isEmpty()) {
            Text("Nothing planned or logged yet.", style = MaterialTheme.typography.bodySmall, color = c.faint)
        } else {
            for (r in rows) MealLine(r, onMeal)
        }
    }
}

@Composable
private fun MealLine(r: DayMealRow, onMeal: (DayMealRow, String) -> Unit) {
    val c = Magnus.colors
    val (mark, color) = when (r.state) {
        "eaten", "instead" -> "Eaten" to c.good
        "extra" -> "Extra" to c.muted
        "skipped" -> "Skipped" to c.faint
        "missed" -> "Not logged" to c.warn
        else -> (r.time ?: "To eat") to c.faint
    }
    Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(r.slot.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelMedium, color = c.muted)
            Text(r.text, style = MaterialTheme.typography.bodyMedium, color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(start = 12.dp)) {
            Text(mark, style = MaterialTheme.typography.labelMedium, color = color)
            if (r.totals.kcal > 0) Text("${r.totals.kcal.roundToInt()} kcal", style = MaterialTheme.typography.bodySmall, color = c.faint)
        }
    }
    // A planned meal still to eat: one strong action and a quiet skip (the Clean UI rule, #245).
    if ((r.state == "todo" || r.state == "missed") && r.slot in PLAN_SLOTS && !r.eatOut) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Skipped it", style = MaterialTheme.typography.labelMedium, color = c.faint,
                modifier = Modifier.clickable { onMeal(r, "skip") }.padding(horizontal = 10.dp, vertical = 6.dp),
            )
            Text(
                "Ate this", style = MaterialTheme.typography.labelLarge, color = c.accentInk,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(c.accent).clickable { onMeal(r, "eat") }
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun Movement(s: TodaySnapshot) {
    val c = Magnus.colors
    val t = s.today
    MagnusCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Text("Movement", style = MaterialTheme.typography.titleMedium, color = c.text)
            Text("${nf.format(t.steps.roundToInt())} of ${nf.format(s.targets.stepTarget.roundToInt())} steps", style = MaterialTheme.typography.bodyMedium, color = c.muted)
        }
        Bar((t.steps / s.targets.stepTarget.coerceAtLeast(1.0)).toFloat(), c.good)
        val facts = buildList {
            t.sleepMinutes?.let { add("Sleep ${(it / 60).toInt()} h ${(it % 60).roundToInt()} min") }
            t.restingHr?.let { add("Resting HR ${it.roundToInt()}") }
            t.totalKcal?.let { add("Burned ${nf.format(it.roundToInt())} kcal") }
        }
        if (facts.isNotEmpty()) Text(facts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = c.muted)
        for (item in t.routine) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(item.label, style = MaterialTheme.typography.bodyMedium, color = c.text, modifier = Modifier.weight(1f))
                Text(
                    when (item.state) { "done" -> "Done"; "skipped" -> "Skipped"; else -> item.startTime ?: "To do" },
                    style = MaterialTheme.typography.labelMedium,
                    color = when (item.state) { "done" -> c.good; "skipped" -> c.faint; else -> c.muted },
                )
            }
        }
    }
}
