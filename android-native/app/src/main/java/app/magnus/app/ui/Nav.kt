package app.magnus.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

/** Screens that open over the tabs, each with a back arrow (anything taller than a small pick list). */
enum class Screen(val title: String) { LogMeal("Log a meal"), WeighIn("Weigh-in"), Steps("Steps") }

/**
 * Where you are: the tab, the screens opened on top of it, and the + Log sheet. Back closes the
 * sheet, then pops a screen, then goes to Coach, then leaves the app (the PWA's rule, PR #149).
 */
class Navigator {
    var tab by mutableStateOf(Tab.Coach)
    val stack = mutableStateListOf<Screen>()
    var logSheet by mutableStateOf(false)
    var toast by mutableStateOf<String?>(null)

    fun open(s: Screen) {
        logSheet = false
        stack.add(s)
    }

    fun back(): Boolean = when {
        logSheet -> { logSheet = false; true }
        stack.isNotEmpty() -> { stack.removeAt(stack.lastIndex); true }
        tab != Tab.Coach -> { tab = Tab.Coach; true }
        else -> false
    }

    fun closeAll() {
        logSheet = false
        stack.clear()
    }

    fun say(text: String) {
        toast = text
    }
}

val LocalNav = staticCompositionLocalOf<Navigator> { error("Navigator not provided") }
