/**
 * Assembles Memory / LifeOS context for the Morning Brief.
 * Queries are best-effort: missing tables or columns quiet-fail (logged at debug).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfLocalDay } from "../events/eventTime.js";
import { logger } from "../logger.js";

export type MorningBriefContextBundle = {
  /** ISO timestamp for the "now" used in this brief (injected for tests). */
  nowIso: string;
  /** IANA timezone used for interpretation (from profile or fallback). */
  timeZone: string;
  northStarGoal?: string;
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
  /** Emerging+ patterns only — filtered from raw rows when possible. */
  patternRows: unknown[];
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

  const profile = await safeMaybeSingle<{ timezone?: string | null; north_star_goal?: string | null }>(
    "user_profile",
    async () =>
      await supabase
        .from("user_profile")
        .select("timezone, north_star_goal")
        .eq("id", userProfileId)
        .maybeSingle(),
  );

  const timeZone =
    (typeof profile?.timezone === "string" && profile.timezone.trim()) || fallbackTz;
  const northStar =
    options?.northStarGoal?.trim() ||
    (typeof profile?.north_star_goal === "string" ? profile.north_star_goal.trim() : "") ||
    undefined;

  let goals =
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

  const pillarStatus =
    (await safeList("pillar_status", async () =>
      await supabase.from("pillar_status").select("*").eq("user_profile_id", userProfileId).limit(16),
    )) ?? [];

  const happinessReserve = await safeMaybeSingle("happiness_reserve", () =>
    supabase
      .from("happiness_reserve")
      .select("*")
      .eq("user_profile_id", userProfileId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  const since = isoDaysAgo(now, 7);
  let kpiReadings =
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

  const magnusInsights =
    (await safeList("magnus_insights", async () =>
      await supabase
        .from("magnus_insights")
        .select("*")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false })
        .limit(8),
    )) ?? [];

  const dailyPlans =
    (await safeList("daily_plans", async () =>
      await supabase
        .from("daily_plans")
        .select("*")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false })
        .limit(7),
    )) ?? [];

  const magnusDailyLogs =
    (await safeList("magnus_daily_logs", async () =>
      await supabase
        .from("magnus_daily_logs")
        .select("body, log_date, source, created_at")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false })
        .limit(12),
    )) ?? [];

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

  const rawPatterns =
    (await safeList("patterns", async () =>
      await supabase.from("patterns").select("*").eq("user_profile_id", userProfileId).limit(24),
    )) ??
    (await safeList("life_patterns", async () =>
      await supabase.from("life_patterns").select("*").eq("user_profile_id", userProfileId).limit(24),
    )) ??
    [];

  const patternRows = filterEmergingPlusPatterns(rawPatterns ?? []);

  return {
    nowIso: now.toISOString(),
    timeZone,
    northStarGoal: northStar,
    goals,
    pillarStatus,
    happinessReserve,
    kpiReadings,
    magnusInsights,
    dailyPlans,
    magnusDailyLogs,
    events,
    eventActivityStats,
    patternRows,
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
    activeGoals: bundle.goals,
    pillarStatus: bundle.pillarStatus,
    happinessReserve: bundle.happinessReserve,
    recentKpiReadings7d: bundle.kpiReadings,
    recentInsights: bundle.magnusInsights,
    recentDailyPlans: bundle.dailyPlans,
    recentMagnusDailyLogs: bundle.magnusDailyLogs,
    commitmentsYesterdayAndToday: bundle.events,
    activityAdherence: bundle.eventActivityStats,
    patternsEmergingPlus: bundle.patternRows,
  };
  return `Context JSON (stored facts only; gaps are OK):\n${JSON.stringify(payload, null, 2)}`;
}
