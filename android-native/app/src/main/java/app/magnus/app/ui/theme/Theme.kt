package app.magnus.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.magnus.app.R

/** The PWA's palette (pwa/styles.css): deep aubergine with one antique-gold accent, ivory in light. */
@Immutable
data class MagnusColors(
    val bg: Color,
    val surface: Color,
    val raised: Color,
    val sunken: Color,
    val hair: Color,
    val text: Color,
    val muted: Color,
    val faint: Color,
    val accent: Color,
    val accentInk: Color,
    val accentSoft: Color,
    val good: Color,
    val warn: Color,
    val bad: Color,
    val protein: Color,
    val carbs: Color,
    val fat: Color,
)

val DarkColors = MagnusColors(
    bg = Color(0xFF160F1D), surface = Color(0xFF1F1628), raised = Color(0xFF2A1F35), sunken = Color(0xFF1A1222),
    hair = Color(0xFF31263D), text = Color(0xFFF4EEE3), muted = Color(0xFFB9AEC4), faint = Color(0xFF8A7E96),
    accent = Color(0xFFC9A24A), accentInk = Color(0xFF1E1526), accentSoft = Color(0x24C9A24A),
    good = Color(0xFF6CC59A), warn = Color(0xFFE3B062), bad = Color(0xFFEE8A8A),
    protein = Color(0xFFC9A24A), carbs = Color(0xFF8FA8E8), fat = Color(0xFFD9837A),
)

val LightColors = MagnusColors(
    bg = Color(0xFFFAF6EE), surface = Color(0xFFFFFFFF), raised = Color(0xFFF1EADF), sunken = Color(0xFFF4EEE4),
    hair = Color(0xFFECE4D6), text = Color(0xFF1E1526), muted = Color(0xFF5E5368), faint = Color(0xFF8B8094),
    accent = Color(0xFF5B2E7A), accentInk = Color(0xFFFBF7FF), accentSoft = Color(0x175B2E7A),
    good = Color(0xFF23714F), warn = Color(0xFF8F5A06), bad = Color(0xFFB3261E),
    protein = Color(0xFF7A5A12), carbs = Color(0xFF3D63B8), fat = Color(0xFFB5523F),
)

val Lato = FontFamily(
    Font(R.font.lato_light, FontWeight.Light),
    Font(R.font.lato_regular, FontWeight.Normal),
    Font(R.font.lato_bold, FontWeight.Bold),
    Font(R.font.lato_black, FontWeight.Black),
)

private val base = TextStyle(fontFamily = Lato)

private val MagnusTypography = Typography(
    displaySmall = base.copy(fontSize = 34.sp, fontWeight = FontWeight.Light, lineHeight = 40.sp),
    headlineSmall = base.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 28.sp),
    titleLarge = base.copy(fontSize = 20.sp, fontWeight = FontWeight.Bold, lineHeight = 26.sp),
    titleMedium = base.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold, lineHeight = 22.sp),
    titleSmall = base.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold, lineHeight = 20.sp),
    bodyLarge = base.copy(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = base.copy(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = base.copy(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = base.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold, lineHeight = 20.sp),
    labelMedium = base.copy(fontSize = 12.sp, fontWeight = FontWeight.Bold, lineHeight = 16.sp),
    labelSmall = base.copy(fontSize = 11.sp, lineHeight = 14.sp),
)

val LocalMagnusColors = staticCompositionLocalOf { DarkColors }

/** "system" follows the phone; "light" / "dark" are the choice on the You tab (same as the PWA). */
enum class ThemeChoice { System, Light, Dark }

@Composable
fun MagnusTheme(choice: ThemeChoice = ThemeChoice.System, content: @Composable () -> Unit) {
    val dark = when (choice) {
        ThemeChoice.System -> isSystemInDarkTheme()
        ThemeChoice.Light -> false
        ThemeChoice.Dark -> true
    }
    val c = if (dark) DarkColors else LightColors
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.accent, onPrimary = c.accentInk, background = c.bg, onBackground = c.text,
            surface = c.surface, onSurface = c.text, surfaceVariant = c.raised, onSurfaceVariant = c.muted,
            outline = c.hair, outlineVariant = c.hair, error = c.bad, surfaceContainer = c.surface,
            surfaceContainerLow = c.sunken, surfaceContainerHigh = c.raised,
        )
    } else {
        lightColorScheme(
            primary = c.accent, onPrimary = c.accentInk, background = c.bg, onBackground = c.text,
            surface = c.surface, onSurface = c.text, surfaceVariant = c.raised, onSurfaceVariant = c.muted,
            outline = c.hair, outlineVariant = c.hair, error = c.bad, surfaceContainer = c.surface,
            surfaceContainerLow = c.sunken, surfaceContainerHigh = c.raised,
        )
    }
    CompositionLocalProvider(LocalMagnusColors provides c) {
        MaterialTheme(colorScheme = scheme, typography = MagnusTypography, content = content)
    }
}

object Magnus {
    val colors: MagnusColors
        @Composable get() = LocalMagnusColors.current
}
