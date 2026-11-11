/**
 * Logging as its own habit (lapsed-logging design, 11 Nov 2026): how many days were logged, how
 * long since anything was logged, and whether each past day's food is accounted for in full.
 *
 * Rules (Saksham, 11 Nov):
 * - Only an explicit skip counts as eating nothing. A meal with no entry is unlogged, never a 0.
 * - A day with nothing logged is Unlogged (northStar.ts), and still not on track.
 * - A day is logged in full when every planned main meal is eaten, changed or skipped, or they
 *   said "That was everything".
 */
import { supabase } from "../tools/clients.js";
import { stableTurnId } from "../util/stableId.js";
import { DAY_MS } from "../util/time.js";
import type { DayScore } from "./northStar.js";

export type LoggingStatus = {
  /** Last local date with a meal logged or a planned meal skipped; null when they never logged. */
  lastLogDate: string | null;
  /** Whole days since that date (0 = something logged today). null when they never logged. */
  daysSinceLog: number | null;
  /** Finished days in a row with nothing logged, ending yesterday (0 when yesterday was logged). */
  blankDays: number;
  /** Finished days in the 7-day window with something logged. */
  loggedDays: number;
  /** Finished days in the window. */
  windowDays: number;
  /** Finished days in a row logged in full, ending yesterday. */
  streak: number;
  /**
   * Days with nothing logged right before the last logged day, as far as the window shows (up to
   * 6). With lastLogDate today and this at 3 or more, they've just come back.
   */
  gapBefore: number;
  /** The last stretch of 3+ logged days before the gap, for a welcome back ("4–6 Nov"). */
  lastGoodStretch: { from: string; to: string; days: number } | null;
};

const MAIN_SLOTS = ["breakfast", "lunch", "dinner"] as const;

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);

/** The chat turn "That was everything" posts for a day (rhythm.ts confirmDayComplete). */
export const dayCompleteTurnId = (userProfileId: string, date: string) => stableTurnId(`magnus-day-complete:${userProfileId}:${date}`);

/**
 * Every planned main meal of the day has a log in its slot, or was skipped (or eaten from the
 * plan). Snacks don't count: a skipped snack is normal. Pure.
 */
export function plannedMealsAccountedFor(planned: Array<{ slot: string; status: string }>, loggedSlots: Set<string>): boolean {
  return MAIN_SLOTS.every((slot) => !planned.some((m) => m.slot === slot && m.status === "planned") || loggedSlots.has(slot));
}

/** The summary from the window's scored days (oldest → newest, today last) and the last log date. Pure. */
export function loggingSummary(today: string, lastLogDate: string | null, days: DayScore[]): LoggingStatus {
  const past = days.filter((d) => d.date < today);
  const daysSinceLog = lastLogDate ? Math.max(0, dayNum(today) - dayNum(lastLogDate)) : null;
  const blankDays = lastLogDate === null ? past.length : Math.max(0, (daysSinceLog ?? 0) - 1);
  let streak = 0;
  for (const d of [...past].reverse()) {
    if (d.unlogged || d.partial) break;
    streak += 1;
  }
  let gapBefore = 0;
  const lastIdx = lastLogDate ? days.findIndex((d) => d.date === lastLogDate) : -1;
  if (lastIdx > 0) {
    for (let i = lastIdx - 1; i >= 0 && days[i]!.unlogged; i--) gapBefore += 1;
  }
  // Newest run of 3+ days with food logged, before the latest gap.
  let lastGoodStretch: LoggingStatus["lastGoodStretch"] = null;
  const end = lastIdx > 0 ? lastIdx - gapBefore : past.length;
  let run: DayScore[] = [];
  for (let i = end - 1; i >= -1; i--) {
    const d = i >= 0 ? days[i] : undefined;
    if (d && !d.unlogged) {
      run.unshift(d);
      continue;
    }
    if (run.length >= 3) {
      lastGoodStretch = { from: run[0]!.date, to: run.at(-1)!.date, days: run.length };
      break;
    }
    run = [];
  }
  return {
    lastLogDate,
    daysSinceLog,
    blankDays,
    loggedDays: past.filter((d) => !d.unlogged).length,
    windowDays: past.length,
    streak,
    gapBefore,
    lastGoodStretch,
  };
}

/** Most recent local date (up to `today`) with a meal logged or a planned meal skipped. */
export async function loadLastLogDate(userProfileId: string, today: string): Promise<string | null> {
  const [logs, skips] = await Promise.all([
    supabase.from("meal_logs").select("local_date").eq("user_profile_id", userProfileId).is("deleted_at", null).lte("local_date", today).order("local_date", { ascending: false }).limit(1),
    supabase.from("meal_plan_entries").select("local_date").eq("user_profile_id", userProfileId).eq("status", "skipped").lte("local_date", today).order("local_date", { ascending: false }).limit(1),
  ]);
  if (logs.error) throw new Error(`last log: ${logs.error.message}`);
  const dates = [logs.data?.[0]?.local_date, skips.error ? undefined : skips.data?.[0]?.local_date].filter((d): d is string => typeof d === "string");
  return dates.length ? dates.sort().at(-1)! : null;
}

/**
 * Per past date in the window: how many planned meals were skipped, and whether the day is logged
 * in full (only for days with a meal plan; without one the score falls back to the calorie share).
 */
export async function loadDayAccounting(
  userProfileId: string,
  from: string,
  today: string,
  loggedSlots: Map<string, Set<string>>,
): Promise<Map<string, { skipped: number; loggedInFull?: boolean }>> {
  const out = new Map<string, { skipped: number; loggedInFull?: boolean }>();
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("local_date, meal_slot, status")
    .eq("user_profile_id", userProfileId)
    .eq("source", "plan")
    .gte("local_date", from)
    .lte("local_date", today)
    .in("status", ["planned", "logged", "partial", "skipped"]);
  if (error) return out;
  const byDate = new Map<string, Array<{ slot: string; status: string }>>();
  for (const r of (data ?? []) as Array<{ local_date: string; meal_slot: string; status: string }>) {
    byDate.set(r.local_date, [...(byDate.get(r.local_date) ?? []), { slot: r.meal_slot, status: r.status }]);
  }
  const gaps: string[] = [];
  for (const [date, planned] of byDate) {
    const skipped = planned.filter((p) => p.status === "skipped").length;
    if (date >= today) {
      out.set(date, { skipped });
      continue;
    }
    const full = plannedMealsAccountedFor(planned, loggedSlots.get(date) ?? new Set());
    out.set(date, { skipped, loggedInFull: full });
    if (!full) gaps.push(date);
  }
  // A gap they closed with "That was everything" is a full day.
  if (gaps.length) {
    const ids = new Map(gaps.map((d) => [dayCompleteTurnId(userProfileId, d), d]));
    const { data: done } = await supabase.from("health_chat_messages").select("turn_id").eq("user_profile_id", userProfileId).in("turn_id", [...ids.keys()]);
    for (const r of (done ?? []) as Array<{ turn_id: string }>) {
      const d = ids.get(r.turn_id);
      if (d) out.set(d, { ...out.get(d)!, loggedInFull: true });
    }
  }
  return out;
}
