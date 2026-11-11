package app.magnus.app.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** The PWA's line icons (pwa/index.html), same 24-unit paths, so both apps look alike. */
object MagnusIcons {
    private fun line(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            for (d in paths) {
                addPath(
                    pathData = addPathNodes(d),
                    fill = null,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 1.8f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()

    val Coach = line("coach", "M4 5h16v11H9l-5 4z")
    val Today = line("today", "M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z", "M4 10h16M9 3v4M15 3v4")
    val Meals = line("meals", "M4 12h16a8 8 0 0 1-16 0z", "M8 8c0-1.5 1-2 1-3.5M12 8c0-1.5 1-2 1-3.5M16 8c0-1.5 1-2 1-3.5")
    val Progress = line("progress", "M4 19h16M7 16v-5M12 16V7M17 16v-8")
    val You = line("you", "M15.6 8a3.6 3.6 0 1 1-7.2 0a3.6 3.6 0 1 1 7.2 0z", "M4.5 20c1.2-3.6 4.1-5.4 7.5-5.4s6.3 1.8 7.5 5.4")
    val Back = line("back", "M15 5l-7 7 7 7")
    val Send = line("send", "M5 12h14M13 6l6 6-6 6")
    val Stop = line("stop", "M8 8h8v8H8z")
    val Plus = line("plus", "M12 5v14M5 12h14")
    val Meal = line("meal", "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-1.7 1-2.5 3-2.5 6s1 4 2.5 4v8")
    val Steps = line("steps", "M8 4c1.5 0 2.5 2 2.5 4.5S9.5 13 8 13s-2.5-2-2.5-4.5S6.5 4 8 4zM6 16h4v2a2 2 0 0 1-4 0zM16 8c1.5 0 2.5 2 2.5 4.5S17.5 17 16 17s-2.5-2-2.5-4.5S14.5 8 16 8z")
    val Scale = line("scale", "M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z", "M9 9.5a4 4 0 0 1 6 0M12 9.5l1.2-1.6")
    val Water = line("water", "M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z")
}
