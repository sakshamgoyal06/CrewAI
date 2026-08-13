/**
 * Assembles Memory / LifeOS context for the Morning Brief.
 * Queries are best-effort: missing tables or columns quiet-fail (logged at debug).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { reconcileFromRecentJournalLogs } from "../events/eventCompletionReconcile.js";
import { loadMealProactiveSnapshot } from "../nutrition/mealProactiveSignals.js";
import { startOfLocalDay } from "../events/eventTime.js";
import { lifeosContextEnabled } from "../config/lifeosContext.js";
import { logger } from "../logger.js";

export type MorningBriefContextBundle = {
  /** ISO timestamp for the "now" used in this brief (injected for tests). */
  nowIso: string;
  /** IANA timezone used for interpretation (from profile or fallback). */
  timeZone: string;
  northStarGoal?: string;
  displayName?: string;
  goals: unknown[];
  pillarStatus: unknown[];
  happinessReserve: unknown | null;
  kpiReadings: unknown[];
  magnusInsights: unknown[];
  dailyPlans: unknown[];
  /** Recent free-form notes from `magnus_daily_logs` (Notion / Telegram mirror). */
  magnusDailyLogs: unknown[];
  /** Commitments from yesterday through tonight, from `magnus_events`. */
  events: unknown[];
  /** Per-activity adherence from `magnus_event_activity_stats`. */
  eventActivityStats: unknown[];
  /** Nutrition slice when meal rollups exist. */
  nutritionBrief: {
    yesterdayCalories: number | null;
    yesterdayProtein: number | null;
    yesterdayTargetCalories: number | null;
    todayPlannedMeals: Array<{ slot: string; title: string; status: string }>;
    caloriesSoFarToday: number | null;
  } | null;
  /** Emerging+ patterns only — filtered from raw rows when possible. */
  patternRows: unknown[];
  /** Which LifeOS domains have real rows (omit empty sections in the brief). */
  dataAvailability: {
    goals: boolean;
    pillarStatus: boolean;
    happinessReserve: boolean;
    kpiReadings: boolean;
    patterns: boolean;
    dailyPlans: boolean;
    magnusInsights: boolean;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST row shape varies
async function safeList(
  label: string,
  fn: () => PromiseLike<{ data: any; error: any }>,
): Promise<any[] | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      logger.debug({ label, err: String(error.message ?? error) }, "morning brief context query skipped");
      return null;
    }
    if (!data) {
      return null;
    }
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    logger.debug({ label, err: String(err) }, "morning brief context query failed");
    return null;
  }
}

async function safeMaybeSingle<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      logger.debug({ label, err: String((error as { message?: string }).message ?? error) }, "morning brief context query skipped");
      return null;
    }
    return data;
  } catch (err) {
    logger.debug({ label, err: String(err) }, "morning brief context query failed");
    return null;
  }
}

function isoDaysAgo(now: Date, days: number): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * Loads tiered context for the brief. Uses `user_profile.timezone` when set; otherwise `fallbackTimeZone`.
 */
export async function fetchMorningBriefContext(
  supabase: SupabaseClient,
  userProfileId: string,
  now: Date,
  options?: { fallbackTimeZone?: string; northStarGoal?: string },
): Promise<MorningBriefContextBundle> {
  const fallbackTz = options?.fallbackTimeZone ?? "Asia/Kolkata";

  const profile = await safeMaybeSingle<{
    timezone?: string | null;
    north_star_goal?: string | null;
    display_name?: string | null;
  }>(
    "user_profile",
    async () =>
      await supabase
        .from("user_profile")
        .select("timezone, north_star_goal, display_name")
        .eq("id", userProfileId)
        .maybeSingle(),
  );

  const timeZone =
    (typeof profile?.timezone === "string" && profile.timezone.trim()) || fallbackTz;
  const northStar =
    options?.northStarGoal?.trim() ||
    (typeof profile?.north_star_goal === "string" ? profile.north_star_goal.trim() : "") ||
    undefined;
  const displayName =
    typeof profile?.display_name === "string" ? profile.display_name.trim() || undefined : undefined;

  let goals: unknown[] = [];
  if (lifeosContextEnabled()) {
    goals =
      (await safeList("goals", async () =>
        await supabase
          .from("goals")
          .select("*")
          .eq("user_profile_id", userProfileId)
          .eq("status", "active")
          .eq("is_deleted", false)
          .limit(24),
      )) ?? [];

    if (goals.length === 0) {
      goals =
        (await safeList("goals_fallback", () =>
          supabase
            .from("goals")
            .select("*")
            .eq("user_profile_id", userProfileId)
            .eq("status", "active")
            .limit(24),
        )) ?? [];
    }
  }

  let pillarStatus: unknown[] = [];
  let happinessReserve: unknown | null = null;
  let kpiReadings: unknown[] = [];
  let magnusInsights: unknown[] = [];
  let dailyPlans: unknown[] = [];

  if (lifeosContextEnabled()) {
    pillarStatus =
      (await safeList("pillar_status", async () =>
        await supabase.from("pillar_status").select("*").eq("user_profile_id", userProfileId).limit(16),
      )) ?? [];

    happinessReserve = await safeMaybeSingle("happiness_reserve", () =>
      supabase
        .from("happiness_reserve")
        .select("*")
        .eq("user_profile_id", userProfileId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );

    const since = isoDaysAgo(now, 7);
    kpiReadings =
      (await safeList("kpi_readings", async () =>
        await supabase
          .from("kpi_readings")
          .select("*")
          .eq("user_profile_id", userProfileId)
          .gte("recorded_at", since)
          .order("recorded_at", { ascending: false })
          .limit(40),
      )) ?? [];

    if (kpiReadings.length === 0) {
      kpiReadings =
        (await safeList("kpi_readings_created", async () =>
          await supabase
            .from("kpi_readings")
            .select("*")
            .eq("user_profile_id", userProfileId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(40),
        )) ?? [];
    }

    magnusInsights =
      (await safeList("magnus_insights", async () =>
        await supabase
          .from("magnus_insights")
          .select("*")
          .eq("user_profile_id", userProfileId)
          .order("created_at", { ascending: false })
          .limit(8),
      )) ?? [];

    dailyPlans =
      (await safeList("daily_plans", async () =>
        await supabase
          .from("daily_plans")
          .select("*")
          .eq("user_profile_id", userProfileId)
          .order("created_at", { ascending: false })
          .limit(7),
      )) ?? [];
  }

  const magnusDailyLogs =
    (await safeList("magnus_daily_logs", async () =>
      await supabase
        .from("magnus_daily_logs")
        .select("body, log_date, source, created_at")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false })
        .limit(12),
    )) ?? [];

  // Close commitments the user already reported in recent journals before the missed sweep runs.
  const journalBodies = magnusDailyLogs
    .map((row) => (row && typeof row === "object" ? (row as { body?: string }).body : null))
    .filter((body): body is string => typeof body === "string" && body.trim().length > 0);
  if (journalBodies.length > 0) {
    try {
      await reconcileFromRecentJournalLogs({
        userProfileId,
        bodies: journalBodies,
      });
    } catch (err) {
      logger.debug({ err: String(err) }, "journal event reconcile skipped");
    }
  }

  // Write off yesterday's untouched commitments before reading, so the brief talks about a log
  // that matches reality rather than one full of stale "planned" rows.
  try {
    const { error } = await supabase.rpc("magnus_sweep_missed_events", {
      p_user_profile_id: userProfileId,
      p_grace_minutes: 180,
      p_max_age_days: 14,
    });
    if (error) {
      logger.debug({ err: String(error.message ?? error) }, "missed-event sweep skipped");
    }
  } catch (err) {
    logger.debug({ err: String(err) }, "missed-event sweep failed");
  }

  const eventsFrom = startOfLocalDay(now, timeZone, -1).toISOString();
  const eventsTo = startOfLocalDay(now, timeZone, 2).toISOString();
  const events =
    (await safeList("magnus_events", async () =>
      await supabase
        .from("magnus_events")
        .select(
          "id, title, details, pillar, activity_key, status, planned_start_at, planned_end_at, " +
            "all_day, started_at, ended_at, actual_minutes, start_delay_minutes, reason, " +
            "outcome_note, reschedule_count, reschedule_kind, time_zone",
        )
        .eq("user_profile_id", userProfileId)
        .gte("planned_start_at", eventsFrom)
        .lt("planned_start_at", eventsTo)
        .order("planned_start_at", { ascending: true })
        .limit(40),
    )) ?? [];

  const eventActivityStats =
    (await safeList("magnus_event_activity_stats", async () =>
      await supabase
        .from("magnus_event_activity_stats")
        .select("*")
        .eq("user_profile_id", userProfileId)
        .order("total", { ascending: false })
        .limit(10),
    )) ?? [];

  let rawPatterns: unknown[] = [];
  if (lifeosContextEnabled()) {
    rawPatterns =
      (await safeList("patterns", async () =>
        await supabase.from("patterns").select("*").eq("user_profile_id", userProfileId).limit(24),
      )) ??
      (await safeList("life_patterns", async () =>
        await supabase.from("life_patterns").select("*").eq("user_profile_id", userProfileId).limit(24),
      )) ??
      [];
  }

  const patternRows = filterEmergingPlusPatterns(rawPatterns ?? []);

  const meals = await loadMealProactiveSnapshot({
    userProfileId,
    timezone: timeZone,
    now,
    recentUserChatSnippet: "",
  }).catch(() => null);

  const nutritionBrief =
    meals &&
    (meals.yesterdayCalories !== null ||
      meals.plannedSlotsToday.length > 0 ||
      meals.caloriesSoFarToday > 0)
      ? {
          yesterdayCalories: meals.yesterdayCalories,
          yesterdayProtein: meals.yesterdayProtein,
          yesterdayTargetCalories: meals.yesterdayTargetCalories,
          todayPlannedMeals: meals.plannedSlotsToday.map((slot) => ({
            slot,
            title: meals.plannedTitlesToday[slot] ?? "",
            status: meals.mealsLoggedTodaySlots.includes(slot) ? "logged" : "planned",
          })),
          caloriesSoFarToday: meals.caloriesSoFarToday,
        }
      : null;

  const dataAvailability = {
    goals: goals.length > 0,
    pillarStatus: pillarStatus.length > 0,
    happinessReserve: happinessReserve != null,
    kpiReadings: kpiReadings.length > 0,
    patterns: patternRows.length > 0,
    dailyPlans: dailyPlans.length > 0,
    magnusInsights: magnusInsights.length > 0,
  };

  return {
    nowIso: now.toISOString(),
    timeZone,
    northStarGoal: northStar,
    displayName,
    goals,
    pillarStatus,
    happinessReserve,
    kpiReadings,
    magnusInsights,
    dailyPlans,
    magnusDailyLogs,
    events,
    eventActivityStats,
    nutritionBrief,
    patternRows,
    dataAvailability,
  };
}

/**
 * Keeps pattern rows that look Emerging+ (heuristic on common column names).
 */
export function filterEmergingPlusPatterns(rows: unknown[]): unknown[] {
  return rows.filter((row) => {
    if (!row || typeof row !== "object") {
      return false;
    }
    const r = row as Record<string, unknown>;
    const stage =
      (typeof r.stage === "string" && r.stage) ||
      (typeof r.confidence === "string" && r.confidence) ||
      (typeof r.status === "string" && r.status) ||
      "";
    const s = stage.toLowerCase();
    if (s.includes("tentative")) {
      return false;
    }
    if (
      s.includes("emerging") ||
      s.includes("confirmed") ||
      s.includes("strong") ||
      s.includes("validated")
    ) {
      return true;
    }
    const hits = r.hit_count ?? r.evidence_count ?? r.count;
    if (typeof hits === "number" && hits >= 2) {
      return true;
    }
    if (typeof hits === "string" && /^\d+$/.test(hits) && Number.parseInt(hits, 10) >= 2) {
      return true;
    }
    return false;
  });
}

export function buildMorningBriefUserMessage(bundle: MorningBriefContextBundle): string {
  const payload = {
    now: bundle.nowIso,
    timeZone: bundle.timeZone,
    northStarGoal: bundle.northStarGoal ?? null,
    dataAvailability: bundle.dataAvailability,
    briefingRules: {
      omitEmptyLifeOSSections:
        "When dataAvailability is false for a domain, omit that section entirely — do not say 'unknown' or 'no data'.",
      commitments:
        "Use commitmentsYesterdayAndToday and activityAdherence when present; these are wired.",
    },
    activeGoals: bundle.goals,
    pillarStatus: bundle.pillarStatus,
    happinessReserve: bundle.happinessReserve,
    recentKpiReadings7d: bundle.kpiReadings,
    recentInsights: bundle.magnusInsights,
    recentDailyPlans: bundle.dailyPlans,
    recentMagnusDailyLogs: bundle.magnusDailyLogs,
    commitmentsYesterdayAndToday: bundle.events,
    activityAdherence: bundle.eventActivityStats,
    nutritionBrief: bundle.nutritionBrief,
    patternsEmergingPlus: bundle.patternRows,
  };
  return `Context JSON (stored facts only; respect dataAvailability):\n${JSON.stringify(payload, null, 2)}`;
}
