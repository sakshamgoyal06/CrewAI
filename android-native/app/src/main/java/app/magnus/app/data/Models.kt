package app.magnus.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Lenient on purpose: the server adds fields often, and an older app must keep reading. */
val MagnusJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
}

/** GET /api/health/config: what sign-in needs before there is a session. */
@Serializable
data class AuthConfig(
    val supabaseUrl: String? = null,
    val supabaseKey: String? = null,
    val google: Boolean = false,
    val googleClientId: String? = null,
)

@Serializable
data class ConfigResponse(val auth: AuthConfig = AuthConfig())

@Serializable
data class WhoAmI(val name: String? = null, val email: String? = null)

// ---------- GET /today (src/healthApp/snapshot.ts HealthSnapshot), only what the app shows ----------

@Serializable
data class DayCheck(
    val id: String = "",
    val label: String = "",
    val met: Boolean = false,
    val progress: Double = 0.0,
    val detail: String = "",
)

@Serializable
data class RoutineItemStatus(
    val label: String = "",
    val state: String = "pending",
    val startTime: String? = null,
    val detail: String? = null,
)

@Serializable
data class TodayDay(
    val date: String = "",
    val checks: List<DayCheck> = emptyList(),
    val onTrack: Boolean = false,
    val unlogged: Boolean = false,
    val partial: Boolean = false,
    val paused: Boolean = false,
    val score: Double = 0.0,
    val calories: Double = 0.0,
    val proteinG: Double = 0.0,
    val steps: Double = 0.0,
    val stepsFromPhone: Boolean = false,
    val phoneSyncedAt: String? = null,
    val walkMinutes: Double? = null,
    val sleepMinutes: Double? = null,
    val restingHr: Double? = null,
    val totalKcal: Double? = null,
    val hrvMs: Double? = null,
    val isTrainingDay: Boolean = false,
    val routine: List<RoutineItemStatus> = emptyList(),
)

@Serializable
data class ScoreDay(
    val date: String = "",
    val onTrack: Boolean = false,
    val unlogged: Boolean = false,
    val partial: Boolean = false,
    val paused: Boolean = false,
    val score: Double = 0.0,
)

@Serializable
data class NorthStar(
    val onTrackDays: Int = 0,
    val unloggedDays: Int = 0,
    val windowDays: Int = 7,
    val goal: Int = 5,
    val days: List<ScoreDay> = emptyList(),
)

@Serializable
data class Targets(
    val calorieTarget: Double? = null,
    val proteinTarget: Double? = null,
    val stepTarget: Double = 8000.0,
)

@Serializable
data class Macros(
    val kcal: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
)

@Serializable
data class DayMealRow(
    val key: String = "",
    val slot: String = "",
    /** todo | missed | eaten | instead | extra | skipped */
    val state: String = "todo",
    val text: String = "",
    val totals: Macros = Macros(),
    val time: String? = null,
    val eatOut: Boolean = false,
)

@Serializable
data class DayMeals(
    val date: String = "",
    val rows: List<DayMealRow> = emptyList(),
    val done: Int = 0,
    val planned: Int = 0,
    val eaten: Macros = Macros(),
    val toEat: Macros = Macros(),
)

@Serializable
data class TodaySnapshot(
    val timezone: String = "",
    val today: TodayDay = TodayDay(),
    val northStar: NorthStar = NorthStar(),
    val targets: Targets = Targets(),
    val mealList: DayMeals? = null,
    val hevyConnected: Boolean = false,
)
