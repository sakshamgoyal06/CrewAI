package app.magnus.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.magnus.app.ui.MagnusRoot
import app.magnus.app.ui.theme.MagnusTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Edge to edge: the app draws behind the status and navigation bars and pads its own content.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        val graph = appGraph
        setContent {
            val theme by graph.theme.collectAsStateWithLifecycle()
            MagnusTheme(theme) { MagnusRoot(graph) }
        }
    }
}
