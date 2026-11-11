package app.magnus.app.ui.coach

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.magnus.app.AppGraph
import app.magnus.app.data.ChatRow
import app.magnus.app.ui.MagnusIcons
import app.magnus.app.ui.theme.Magnus

/** The home screen: today's thread with the coach, cards inline, a composer nothing ever covers. */
@Composable
fun CoachScreen(graph: AppGraph) {
    val c = Magnus.colors
    val ui by graph.chat.ui.collectAsStateWithLifecycle()
    var draft by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(Unit) { graph.chat.refresh() }

    // Rows, then the live answer: keep the newest in view as it grows.
    val extra = (if (ui.sending) 1 else 0) + (if (ui.error != null) 1 else 0)
    val total = ui.rows.size + extra
    LaunchedEffect(total, ui.liveText?.length, ui.discards) {
        if (total > 0) list.animateScrollToItem(total - 1)
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        if (ui.offline) {
            Text("Offline · showing the saved thread", style = MaterialTheme.typography.bodySmall, color = c.warn, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (ui.rows.isEmpty() && !ui.sending && ui.loaded) {
                Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Tell me what you ate, how you trained, or ask anything about your plan.", style = MaterialTheme.typography.bodyLarge, color = c.muted)
                }
            }
            LazyColumn(
                state = list,
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                itemsIndexed(ui.rows, key = { i, r -> "$i:${r.createdAt}:${r.role}" }) { _, row -> Message(row, graph) }
                if (ui.sending) item("live") { Live(ui.progress, ui.liveText) }
                if (ui.error != null) item("error") {
                    Column {
                        Text(ui.error.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = c.bad)
                        if (ui.retryText != null) Text(
                            "Retry", style = MaterialTheme.typography.labelLarge, color = c.accent,
                            modifier = Modifier.clickable { graph.chat.retry() }.padding(vertical = 6.dp),
                        )
                    }
                }
            }
        }
        Composer(
            text = draft,
            onText = { draft = it },
            sending = ui.sending,
            onSend = {
                graph.chat.send(draft)
                draft = ""
            },
            onStop = { graph.chat.stop() },
        )
    }
}

@Composable
private fun Message(row: ChatRow, graph: AppGraph) {
    val c = Magnus.colors
    if (row.role == "user") {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(
                row.content,
                style = MaterialTheme.typography.bodyLarge,
                color = c.text,
                modifier = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(20.dp, 20.dp, 6.dp, 20.dp))
                    .background(c.accentSoft).padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
        return
    }
    Column(Modifier.fillMaxWidth()) {
        if (row.content.isNotBlank()) Text(row.content, style = MaterialTheme.typography.bodyLarge, color = c.text)
        if (row.status == "pending") Text("Still writing…", style = MaterialTheme.typography.bodySmall, color = c.faint)
        for (card in row.cards) ChatCard(card, graph)
    }
}

@Composable
private fun Live(progress: String?, text: String?) {
    val c = Magnus.colors
    if (text.isNullOrEmpty()) {
        Text(progress?.let { "$it…" } ?: "Thinking…", style = MaterialTheme.typography.bodyMedium, color = c.faint)
    } else {
        Text(text, style = MaterialTheme.typography.bodyLarge, color = c.text)
    }
}

@Composable
private fun Composer(text: String, onText: (String) -> Unit, sending: Boolean, onSend: () -> Unit, onStop: () -> Unit) {
    val c = Magnus.colors
    Row(
        Modifier.fillMaxWidth().background(c.bg).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(c.surface).padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            if (text.isEmpty()) Text("Message your coach", style = MaterialTheme.typography.bodyLarge, color = c.faint)
            BasicTextField(
                value = text,
                onValueChange = onText,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = c.text),
                cursorBrush = SolidColor(c.accent),
                maxLines = 6,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        val canSend = text.isNotBlank() && !sending
        Box(
            Modifier.size(48.dp).clip(CircleShape).background(if (sending || canSend) c.accent else c.raised)
                .clickable(enabled = sending || canSend) { if (sending) onStop() else onSend() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (sending) MagnusIcons.Stop else MagnusIcons.Send,
                contentDescription = if (sending) "Stop" else "Send",
                tint = if (sending || canSend) c.accentInk else c.faint,
            )
        }
    }
}
