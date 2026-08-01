/**
 * Assembles Memory / LifeOS context for the Morning Brief.
 * Queries are best-effort: missing tables or columns quiet-fail (logged at debug).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { endOfLocalDay, localDateKey, startOfLocalDay } from "../util/zonedTime.js";

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
  /** Emerging+ patterns only — filtered from raw rows when possible. */
  patternRows: unknown[];
  /** What he already said he would do today, from `magnus_events`. */
  todaysCommitments: unknown[];
  /** The last week's missed, skipped and moved commitments — what the brief should notice. */
  recentSlips: unknown[];
};

/** Enough of a `magnus_events` row to reason about, without paying for the whole table. */
const EVENT_COLUMNS =
  "id, title, pillar, status, planned_start_at, planned_local_time, planned_duration_minutes, " +
  "reschedule_count, original_planned_start_at, start_delay_minutes, outcome_note, all_day";

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

  const rawPatterns =
    (await safeList("patterns", async () =>
      await supabase.from("patterns").select("*").eq("user_profile_id", userProfileId).limit(24),
    )) ??
    (await safeList("life_patterns", async () =>
      await supabase.from("life_patterns").select("*").eq("user_profile_id", userProfileId).limit(24),
    )) ??
    [];

  const patternRows = filterEmergingPlusPatterns(rawPatterns ?? []);

  // Close out yesterday before reading today, so a plan whose time has passed shows as missed
  // rather than sitting in the brief as though it were still ahead of him.
  try {
    await supabase.rpc("magnus_mark_missed_events", {
      p_user_profile_id: userProfileId,
      p_grace: "2 hours",
    });
  } catch (err) {
    logger.debug({ err: String(err) }, "missed-event sweep skipped");
  }

  const todayKey = localDateKey(now, timeZone);
  const dayStart = startOfLocalDay(todayKey, timeZone);
  const dayEnd = endOfLocalDay(todayKey, timeZone);

  const todaysCommitments =
    dayStart && dayEnd
      ? ((await safeList("magnus_events_today", async () =>
          await supabase
            .from("magnus_events")
            .select(EVENT_COLUMNS)
            .eq("user_profile_id", userProfileId)
            .is("deleted_at", null)
            .is("rescheduled_to_event_id", null)
            .gte("planned_start_at", dayStart.toISOString())
            .lt("planned_start_at", dayEnd.toISOString())
            .order("planned_start_at", { ascending: true })
            .limit(30),
        )) ?? [])
      : [];

  const recentSlips =
    (await safeList("magnus_events_slips", async () =>
      await supabase
        .from("magnus_events")
        .select(EVENT_COLUMNS)
        .eq("user_profile_id", userProfileId)
        .is("deleted_at", null)
        .in("status", ["missed", "skipped", "postponed", "preponed", "cancelled"])
        .gte("planned_start_at", since)
        .order("planned_start_at", { ascending: false })
        .limit(20),
    )) ?? [];

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
    patternRows,
    todaysCommitments,
    recentSlips,
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
    patternsEmergingPlus: bundle.patternRows,
    todaysCommitments: bundle.todaysCommitments,
    slipsLast7d: bundle.recentSlips,
  };
  return `Context JSON (stored facts only; gaps are OK):\n${JSON.stringify(payload, null, 2)}`;
}
