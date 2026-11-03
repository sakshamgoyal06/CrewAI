/**
 * Root-cause analysis: why the person is off track.
 *
 * Deterministic signal mining over the last few weeks (which check fails, on which days, which
 * meal is missing, late eating, skip reasons) produces the evidence. Claude then writes one
 * hypothesis and one small experiment from that evidence, and a week later the experiment's
 * target check is compared with its baseline to say whether it helped.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { logger } from "../logger.js";
import { localDateKey } from "../nutrition/localDate.js";
import { anthropic, supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import type { ActionContext } from "./actions.js";
import { getActivityRange } from "./activityStore.js";
import { scoreDay, type CheckId, type DayScore, type HealthTargets } from "./northStar.js";
import { loadHealthProfile, summarizeWorkout, weekdayOfDate, windowDates, type WorkoutSummary } from "./snapshot.js";
import { hevyKey, loadWorkoutHistory } from "./training.js";
import { getWorkoutChecks } from "./workoutCheckStore.js";

const DAY_MS = 86_400_000;
export const RCA_WINDOW_DAYS = 21;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayRecord = {
  date: string;
  weekday: number;
  isTrainingDay: boolean;
  mealSessions: number;
  /** Slots with at least one meal logged. */
  slots: string[];
  calories: number;
  proteinG: number;
  /** Protein by slot, for "which meal is light on protein". */
  proteinBySlot: Record<string, number>;
  /** Local hour (0–23, fractional) of the last meal logged, or null. */
  lastMealHour: number | null;
  steps: number;
  workout: boolean;
  skipReason: string | null;
  score: DayScore;
};

export type Signal = {
  id: string;
  check: CheckId | null;
  text: string;
  /** Off-track days this signal accounts for; used to rank. */
  weight: number;
};

const CHECK_LABEL: Record<CheckId, string> = {
  meals_logged: "Meals logged",
  calories: "Calories in range",
  protein: "Protein",
  steps: "Steps",
  workout: "Workout",
  routine: "Routine",
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const isWeekend = (wd: number) => wd === 0 || wd === 6;

function missed(r: DayRecord, check: CheckId): boolean | null {
  const c = r.score.checks.find((x) => x.id === check);
  return c ? !c.met : null;
}

/** Evidence for why days were off track, strongest first. `records` are complete days only. */
export function findSignals(records: DayRecord[], targets: HealthTargets): Signal[] {
  const off = records.filter((r) => !r.score.onTrack);
  if (!records.length || !off.length) return [];
  const out: Signal[] = [];

  // 1. Which checks fail, and on which kind of day.
  const checks: CheckId[] = ["meals_logged", "calories", "protein", "steps", "workout"];
  for (const check of checks) {
    const applicable = records.filter((r) => missed(r, check) !== null);
    const misses = applicable.filter((r) => missed(r, check));
    if (applicable.length < 3 || misses.length < 2) continue;
    if (pct(misses.length, applicable.length) >= 30) {
      out.push({
        id: `miss:${check}`,
        check,
        text:
          check === "meals_logged"
            ? `Meals not logged on ${misses.length} of ${applicable.length} days.`
            : `${CHECK_LABEL[check]} missed on ${misses.length} of ${applicable.length} days.`,
        weight: misses.length,
      });
    }
    const we = applicable.filter((r) => isWeekend(r.weekday));
    const wd = applicable.filter((r) => !isWeekend(r.weekday));
    const weMiss = we.filter((r) => missed(r, check)).length;
    const wdMiss = wd.filter((r) => missed(r, check)).length;
    if (we.length >= 2 && wd.length >= 3) {
      const gap = pct(weMiss, we.length) - pct(wdMiss, wd.length);
      if (Math.abs(gap) >= 30) {
        out.push({
          id: `weekend:${check}`,
          check,
          text:
            gap > 0
              ? `${CHECK_LABEL[check]}: missed ${weMiss}/${we.length} weekend days vs ${wdMiss}/${wd.length} weekdays.`
              : `${CHECK_LABEL[check]}: missed ${wdMiss}/${wd.length} weekdays vs ${weMiss}/${we.length} weekend days.`,
          weight: gap > 0 ? weMiss : wdMiss,
        });
      }
    }
    // A single weekday that fails far more than the rest (e.g. every Wednesday).
    const byWd = new Map<number, { n: number; m: number }>();
    for (const r of applicable) {
      const b = byWd.get(r.weekday) ?? { n: 0, m: 0 };
      b.n += 1;
      if (missed(r, check)) b.m += 1;
      byWd.set(r.weekday, b);
    }
    const worst = [...byWd.entries()].filter(([, b]) => b.n >= 2 && b.m === b.n).sort((a, b) => b[1].m - a[1].m)[0];
    if (worst && pct(misses.length, applicable.length) < 80) {
      out.push({
        id: `weekday:${check}:${worst[0]}`,
        check,
        text: `${CHECK_LABEL[check]} missed every ${WD[worst[0]]} (${worst[1].m}/${worst[1].n}).`,
        weight: worst[1].m,
      });
    }
  }

  // 2. Meal logging: nothing logged at all vs a specific meal missing.
  const empty = records.filter((r) => r.mealSessions === 0);
  if (empty.length >= 2) {
    out.push({
      id: "meals:none",
      check: "meals_logged",
      text: `Nothing logged on ${empty.length} days (${empty.map((r) => WD[r.weekday]).join(", ")}): those days can't be scored on food.`,
      weight: empty.length,
    });
  }
  const logged = records.filter((r) => r.mealSessions > 0);
  for (const slot of ["breakfast", "lunch", "dinner"]) {
    const without = logged.filter((r) => !r.slots.includes(slot));
    if (logged.length >= 4 && pct(without.length, logged.length) >= 50) {
      out.push({
        id: `meals:slot:${slot}`,
        check: "meals_logged",
        text: `${slot[0]!.toUpperCase()}${slot.slice(1)} missing on ${without.length} of ${logged.length} days that had other meals logged.`,
        weight: without.filter((r) => missed(r, "meals_logged")).length,
      });
    }
  }

  // 3. Calories: over the target, or under the floor (often under-logging).
  if (targets.calorieTarget) {
    const over = logged.filter((r) => r.calories > targets.calorieTarget!);
    const under = logged.filter((r) => r.calories < targets.calorieTarget! * 0.6);
    if (over.length >= 2 && over.length >= under.length) {
      const avgOver = Math.round(over.reduce((s, r) => s + r.calories - targets.calorieTarget!, 0) / over.length);
      out.push({ id: "cal:over", check: "calories", text: `Over the calorie target on ${over.length} days, by ${avgOver} kcal on average.`, weight: over.length });
    } else if (under.length >= 2) {
      out.push({ id: "cal:under", check: "calories", text: `Under 60% of the calorie target on ${under.length} logged days, which usually means meals went unlogged.`, weight: under.length });
    }
    // Late eating and going over.
    const late = logged.filter((r) => r.lastMealHour !== null && r.lastMealHour >= 22);
    const early = logged.filter((r) => r.lastMealHour !== null && r.lastMealHour < 22);
    if (late.length >= 2 && early.length >= 2) {
      const lateOver = pct(late.filter((r) => r.calories > targets.calorieTarget!).length, late.length);
      const earlyOver = pct(early.filter((r) => r.calories > targets.calorieTarget!).length, early.length);
      if (lateOver - earlyOver >= 30) {
        out.push({
          id: "cal:late",
          check: "calories",
          text: `On days with a meal after 10 pm you went over ${lateOver}% of the time, vs ${earlyOver}% otherwise.`,
          weight: late.filter((r) => r.calories > targets.calorieTarget!).length,
        });
      }
    }
  }

  // 4. Protein: the shortfall and the lightest meal.
  if (targets.proteinTarget) {
    const short = logged.filter((r) => r.proteinG < targets.proteinTarget!);
    if (short.length >= 2) {
      const avg = Math.round(logged.reduce((s, r) => s + r.proteinG, 0) / logged.length);
      const bySlot = ["breakfast", "lunch", "dinner"]
        .map((slot) => {
          const days = logged.filter((r) => r.slots.includes(slot));
          return { slot, n: days.length, avg: days.length ? days.reduce((s, r) => s + (r.proteinBySlot[slot] ?? 0), 0) / days.length : 0 };
        })
        .filter((x) => x.n >= 3)
        .sort((a, b) => a.avg - b.avg)[0];
      out.push({
        id: "protein:short",
        check: "protein",
        text: `Protein averages ${avg} g vs ${targets.proteinTarget} g${bySlot ? `; ${bySlot.slot} is the lightest at about ${Math.round(bySlot.avg)} g` : ""}.`,
        weight: short.length,
      });
    }
  }

  // 5. Steps: training vs rest days.
  const train = records.filter((r) => r.isTrainingDay);
  const rest = records.filter((r) => !r.isTrainingDay);
  if (train.length >= 2 && rest.length >= 2) {
    const avg = (rs: DayRecord[]) => Math.round(rs.reduce((s, r) => s + r.steps, 0) / rs.length);
    const t = avg(train);
    const re = avg(rest);
    if (Math.abs(t - re) >= targets.stepTarget * 0.25) {
      const lower = t < re ? "training" : "rest";
      out.push({
        id: `steps:${lower}`,
        check: "steps",
        text: `Steps average ${Math.min(t, re).toLocaleString("en-US")} on ${lower} days vs ${Math.max(t, re).toLocaleString("en-US")} on the others.`,
        weight: (lower === "training" ? train : rest).filter((r) => missed(r, "steps")).length,
      });
    }
  }

  // 6. Workouts: reasons given for skipping.
  const reasons = records.filter((r) => r.isTrainingDay && !r.workout && r.skipReason).map((r) => r.skipReason!.toLowerCase());
  if (reasons.length >= 2) {
    const tally = new Map<string, number>();
    for (const x of reasons) tally.set(x, (tally.get(x) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    out.push({
      id: "workout:reasons",
      check: "workout",
      text: `Skipped sessions, in your words: ${top.map(([r, n]) => `${r} (${n})`).join(", ")}.`,
      weight: reasons.length,
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

/** Hit rate of one check over complete days. */
export function checkHitRate(records: DayRecord[], check: CheckId): { hit: number; of: number; rate: number | null } {
  const applicable = records.filter((r) => missed(r, check) !== null);
  const hit = applicable.filter((r) => !missed(r, check)).length;
  return { hit, of: applicable.length, rate: applicable.length ? hit / applicable.length : null };
}

/** Did the experiment move its check? Needs at least 4 days of data since it started. */
export function experimentOutcome(
  baselineRate: number | null,
  since: DayRecord[],
  check: CheckId,
): { verdict: "helped" | "no_change" | "too_early"; before: number | null; after: number | null; days: number } {
  const r = checkHitRate(since, check);
  if (r.of < 4 || r.rate === null) return { verdict: "too_early", before: baselineRate, after: r.rate, days: r.of };
  const before = baselineRate ?? 0;
  return { verdict: r.rate - before >= 0.15 ? "helped" : "no_change", before, after: r.rate, days: r.of };
}

/** Used when the model call fails: still one concrete hypothesis and experiment. */
export function fallbackInsight(signals: Signal[]): { hypothesis: string; experiment: string; targetCheck: CheckId | null } {
  const top = signals[0];
  if (!top) {
    return { hypothesis: "No clear pattern yet: off days are spread across different checks.", experiment: "Log every meal for the next 7 days so the next review has full data.", targetCheck: "meals_logged" };
  }
  const experiments: Record<CheckId, string> = {
    meals_logged: "Log each meal right after eating for 7 days, using the chat (a one-line description is enough).",
    calories: "Decide dinner by 5 pm for the next 7 days and log it before you eat.",
    protein: "Add one 30 g protein item to your lightest meal every day for 7 days.",
    steps: "Take a 20-minute walk straight after lunch every day for 7 days.",
    workout: "Pack your gym bag the night before every training day for the next 2 weeks.",
    routine: "Keep only the routine items you can do on your worst day for 7 days, then add back one at a time.",
  };
  return {
    hypothesis: top.text,
    experiment: top.check ? experiments[top.check] : experiments.meals_logged,
    targetCheck: top.check,
  };
}

// ---------- loading ----------

type MealRow = { local_date: string; meal_session_id: string | null; meal_slot: string | null; calories: number | null; protein_g: number | null; logged_at: string | null };

/** Builds one record per local day from raw rows. Pure, for tests. */
export function buildDayRecords(input: {
  dates: string[];
  timezone: string;
  targets: HealthTargets;
  meals: MealRow[];
  steps: Map<string, number>;
  workoutDates: Set<string>;
  checks: Map<string, { status: string; reason: string | null }>;
}): DayRecord[] {
  const hourOf = (iso: string) => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: input.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
    const [h, m] = p.split(":").map(Number) as [number, number];
    return h + m / 60;
  };
  return input.dates.map((date) => {
    const rows = input.meals.filter((m) => String(m.local_date) === date);
    const sessions = new Set(rows.map((m) => m.meal_session_id).filter(Boolean));
    const proteinBySlot: Record<string, number> = {};
    let last: number | null = null;
    for (const m of rows) {
      const slot = m.meal_slot ?? "unspecified";
      proteinBySlot[slot] = (proteinBySlot[slot] ?? 0) + (Number(m.protein_g) || 0);
      if (m.logged_at) {
        const h = hourOf(m.logged_at);
        if (last === null || h > last) last = h;
      }
    }
    const weekday = weekdayOfDate(date);
    const check = input.checks.get(date);
    const workout = input.workoutDates.has(date) || check?.status === "trained_unlogged" || check?.status === "found";
    const calories = rows.reduce((s, m) => s + (Number(m.calories) || 0), 0);
    const proteinG = rows.reduce((s, m) => s + (Number(m.protein_g) || 0), 0);
    const steps = input.steps.get(date) ?? 0;
    return {
      date,
      weekday,
      isTrainingDay: input.targets.trainingDays.includes(weekday),
      mealSessions: sessions.size,
      slots: [...new Set(rows.map((m) => m.meal_slot ?? "unspecified"))],
      calories,
      proteinG,
      proteinBySlot,
      lastMealHour: last,
      steps,
      workout,
      skipReason: check?.status === "skipped" ? check.reason : null,
      score: scoreDay({ date, weekday, mealSessions: sessions.size, calories, proteinG, steps, workoutsLogged: workout ? 1 : 0 }, input.targets),
    };
  });
}

/** Complete days only (today excluded), oldest first. */
export async function loadDayRecords(
  userProfileId: string,
  now: Date,
  days = RCA_WINDOW_DAYS,
): Promise<{ records: DayRecord[]; targets: HealthTargets; timezone: string; workouts: WorkoutSummary[] }> {
  const { timezone, targets } = await loadHealthProfile(userProfileId);
  const yesterday = new Date(now.getTime() - DAY_MS);
  const dates = windowDates(yesterday, timezone, days);
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;
  const apiKey = await hevyKey(userProfileId);
  const [meals, activity, checks, hevy] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("local_date, meal_session_id, meal_slot, calories, protein_g, logged_at")
      .eq("user_profile_id", userProfileId)
      .is("deleted_at", null)
      .gte("local_date", from)
      .lte("local_date", to),
    getActivityRange(userProfileId, from, to),
    getWorkoutChecks(userProfileId, from, to),
    apiKey ? loadWorkoutHistory(apiKey, now, Math.ceil(days / 7) + 1) : Promise.resolve(null),
  ]);
  const workoutDates = new Set<string>();
  const workouts: WorkoutSummary[] = [];
  if (hevy?.ok) {
    for (const w of hevy.workouts) {
      const s = summarizeWorkout(w, timezone);
      if (s) {
        workoutDates.add(s.localDate);
        if (s.localDate >= from && s.localDate <= to) workouts.push(s);
      }
    }
  }
  const steps = new Map<string, number>();
  for (const [d, a] of activity) steps.set(d, a.steps);
  const records = buildDayRecords({
    dates,
    timezone,
    targets,
    meals: (meals.data ?? []) as MealRow[],
    steps,
    workoutDates,
    checks: new Map([...checks].map(([d, c]) => [d, { status: c.status, reason: c.reason }])),
  });
  return { records, targets, timezone, workouts };
}

// ---------- reports ----------

export type RcaTrigger = "off_track_streak" | "weekly_review" | "manual";
export type RcaStatus = "proposed" | "trying" | "declined" | "helped" | "no_change";

export type RcaReport = {
  id: string;
  trigger: RcaTrigger;
  periodStart: string;
  periodEnd: string;
  signals: Signal[];
  hypothesis: string;
  experiment: string;
  targetCheck: CheckId | null;
  baselineRate: number | null;
  status: RcaStatus;
  createdAt: string;
  startedAt: string | null;
};

export type RcaCard = {
  type: "rca";
  reportId: string;
  hypothesis: string;
  experiment: string;
  evidence: string[];
  status: RcaStatus;
};

const COLS = "id, trigger, period_start, period_end, signals, hypothesis, experiment, target_check, baseline_rate, status, created_at, started_at";

function fromRow(r: Record<string, unknown>): RcaReport {
  return {
    id: String(r.id),
    trigger: r.trigger as RcaTrigger,
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    signals: (r.signals as Signal[]) ?? [],
    hypothesis: String(r.hypothesis),
    experiment: String(r.experiment),
    targetCheck: (r.target_check as CheckId | null) ?? null,
    baselineRate: r.baseline_rate === null || r.baseline_rate === undefined ? null : Number(r.baseline_rate),
    status: r.status as RcaStatus,
    createdAt: String(r.created_at),
    startedAt: r.started_at ? String(r.started_at) : null,
  };
}

export function cardFromReport(r: RcaReport): RcaCard {
  return { type: "rca", reportId: r.id, hypothesis: r.hypothesis, experiment: r.experiment, evidence: r.signals.map((s) => s.text).filter((t) => t !== r.hypothesis).slice(0, 3), status: r.status };
}

export async function listReports(userProfileId: string, limit = 6): Promise<RcaReport[]> {
  const { data } = await supabase
    .from("health_rca_reports")
    .select(COLS)
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Array<Record<string, unknown>>).map(fromRow);
}

export async function getReports(userProfileId: string, ids: string[]): Promise<Map<string, RcaReport>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("health_rca_reports").select(COLS).eq("user_profile_id", userProfileId).in("id", ids);
  return new Map(((data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.id), fromRow(r)]));
}

const insightSchema = z.object({
  hypothesis: z.string().min(10).max(400),
  experiment: z.string().min(10).max(300),
  targetCheck: z.enum(["meals_logged", "calories", "protein", "steps", "workout"]),
});

const SYSTEM = `You are a health coach doing a root-cause analysis for one person. You get evidence mined from their last few weeks of logs, plus earlier experiments and whether they helped.
Write ONE hypothesis about the main reason they are off track, grounded in the evidence (quote its numbers), and ONE small, specific experiment for the next 7 days that tests it: something concrete they can do daily, not a program change. Don't repeat an experiment that didn't help. Plain words, second person, no hedging, no lists. Answer only by calling the write_rca tool.`;

/** One hypothesis + one experiment from Claude, or a deterministic one if the call fails. */
export async function writeInsight(
  signals: Signal[],
  context: { targets: HealthTargets; onTrackDays: number; days: number; past: RcaReport[] },
  create: (p: Record<string, unknown>) => Promise<Anthropic.Message> = (p) => anthropic.messages.create(p as never) as Promise<Anthropic.Message>,
): Promise<{ hypothesis: string; experiment: string; targetCheck: CheckId | null; source: "model" | "fallback" }> {
  if (!signals.length) return { ...fallbackInsight(signals), source: "fallback" };
  try {
    const msg = await create({
      model: process.env.MAGNUS_HEALTH_CHAT_MODEL?.trim() || "claude-opus-5-5",
      max_tokens: 800,
      // Cache markers: the instructions and tool are identical for everyone, so repeat runs read them
      // from cache once they're long enough to be cached.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [
        {
          name: "write_rca",
          cache_control: { type: "ephemeral" },
          description: "Record the hypothesis and the experiment.",
          input_schema: {
            type: "object",
            properties: {
              hypothesis: { type: "string", description: "1–2 sentences." },
              experiment: { type: "string", description: "One sentence: what to do daily for 7 days." },
              targetCheck: { type: "string", enum: ["meals_logged", "calories", "protein", "steps", "workout"], description: "The daily check the experiment should move." },
            },
            required: ["hypothesis", "experiment", "targetCheck"],
          },
        },
      ],
      // Current models reject a forced tool_choice ("tool"/"any"); the system prompt asks for the call.
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            onTrackDays: `${context.onTrackDays} of ${context.days}`,
            targets: context.targets,
            evidence: signals.map((s) => s.text),
            earlierExperiments: context.past.map((p) => ({ experiment: p.experiment, status: p.status })),
          }),
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    const parsed = insightSchema.safeParse(block && "input" in block ? block.input : null);
    if (parsed.success) return { ...parsed.data, source: "model" };
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "rca model call failed");
  }
  return { ...fallbackInsight(signals), source: "fallback" };
}

type RunDeps = {
  load: typeof loadDayRecords;
  past: typeof listReports;
  insight: typeof writeInsight;
  save: (userProfileId: string, row: Record<string, unknown>) => Promise<RcaReport | null>;
};

const defaultRunDeps: RunDeps = {
  load: (id, now, days) => loadDayRecords(id, now, days),
  past: (id, limit) => listReports(id, limit),
  insight: (s, c) => writeInsight(s, c),
  save: async (userProfileId, row) => {
    const { data, error } = await supabase.from("health_rca_reports").insert({ user_profile_id: userProfileId, ...row }).select(COLS).single();
    if (error || !data) {
      logger.warn({ error: error?.message }, "rca save failed");
      return null;
    }
    return fromRow(data as Record<string, unknown>);
  },
};

export const REUSE_DAYS = 14;

/** A stable key for a set of signals: which patterns, with their numbers. */
export function evidenceSignature(signals: Pick<Signal, "id" | "text">[]): string {
  return signals.map((s) => `${s.id}=${s.text}`).sort().join("|");
}

/**
 * The insight of a recent report built from the same evidence, so the model isn't asked the same
 * question twice. Null when the evidence changed or the last one is older than two weeks.
 */
export function reusableInsight(
  signals: Signal[],
  past: RcaReport[],
  now: Date,
): { hypothesis: string; experiment: string; targetCheck: CheckId | null; source: "reused" } | null {
  if (!signals.length) return null;
  const sig = evidenceSignature(signals);
  const hit = past.find((p) => now.getTime() - Date.parse(p.createdAt) < REUSE_DAYS * DAY_MS && evidenceSignature(p.signals) === sig);
  return hit ? { hypothesis: hit.hypothesis, experiment: hit.experiment, targetCheck: hit.targetCheck, source: "reused" } : null;
}

/** Mines the window, writes the insight and stores the report. Null when there's nothing off track. */
export async function runRca(
  userProfileId: string,
  trigger: RcaTrigger,
  now = new Date(),
  deps: RunDeps = defaultRunDeps,
): Promise<{ report: RcaReport; records: DayRecord[] } | null> {
  const loaded = await deps.load(userProfileId, now, RCA_WINDOW_DAYS);
  const { targets } = loaded;
  // Days before the first meal log aren't "missed meals": tracking hadn't started (Hevy and
  // step history reach further back than the app). Only judge from the first logged meal on.
  const firstLogged = loaded.records.findIndex((r) => r.mealSessions > 0);
  if (firstLogged < 0) return null;
  const records = loaded.records.slice(firstLogged);
  const recent = records.filter((r) => r.mealSessions > 0 || r.steps > 0 || r.workout);
  if (recent.length < 3) return null;
  const signals = findSignals(recent, targets);
  const onTrackDays = recent.filter((r) => r.score.onTrack).length;
  if (!signals.length && trigger !== "manual") return null;
  const past = await deps.past(userProfileId, 6);
  // Same evidence as a report from the last two weeks: reuse its insight instead of a model call.
  const reused = reusableInsight(signals, past, now);
  const insight = reused ?? (await deps.insight(signals, { targets, onTrackDays, days: recent.length, past }));
  const baseline = insight.targetCheck ? checkHitRate(recent.slice(-14), insight.targetCheck).rate : null;
  const report = await deps.save(userProfileId, {
    trigger,
    period_start: records[0]!.date,
    period_end: records[records.length - 1]!.date,
    signals,
    hypothesis: insight.hypothesis,
    experiment: insight.experiment,
    target_check: insight.targetCheck,
    baseline_rate: baseline,
  });
  return report ? { report, records } : null;
}

/** "I'll try it" / "Not this one" on the card. */
export const rcaResponseInput = z.object({ action: z.enum(["try", "decline"]) });

export async function respondToRca(ctx: ActionContext, id: string, action: "try" | "decline"): Promise<{ ok: boolean; status?: RcaStatus; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid_id" };
  const status: RcaStatus = action === "try" ? "trying" : "declined";
  const { data, error } = await supabase
    .from("health_rca_reports")
    .update({ status, started_at: action === "try" ? (ctx.now ?? new Date()).toISOString() : null })
    .eq("user_profile_id", ctx.userProfileId)
    .eq("id", id)
    .in("status", ["proposed", "trying", "declined"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  return (data ?? []).length ? { ok: true, status } : { ok: false, error: "report_not_found" };
}

/**
 * Closes experiments that have run at least a week: compares the target check's hit rate since
 * the start with its baseline. Returns one line per verdict for the weekly review message.
 */
export async function reviewExperiments(userProfileId: string, now = new Date()): Promise<string[]> {
  const trying = (await listReports(userProfileId, 10)).filter((r) => r.status === "trying" && r.startedAt && r.targetCheck);
  const lines: string[] = [];
  for (const r of trying) {
    const started = new Date(r.startedAt!);
    if (now.getTime() - started.getTime() < 7 * DAY_MS) continue;
    const { records, timezone } = await loadDayRecords(userProfileId, now, 14);
    const since = records.filter((d) => d.date >= localDateKey(started, timezone));
    const o = experimentOutcome(r.baselineRate, since, r.targetCheck!);
    if (o.verdict === "too_early") continue;
    await supabase
      .from("health_rca_reports")
      .update({ status: o.verdict, reviewed_at: now.toISOString(), outcome: o })
      .eq("id", r.id);
    const b = Math.round((o.before ?? 0) * 100);
    const a = Math.round((o.after ?? 0) * 100);
    lines.push(
      o.verdict === "helped"
        ? `"${r.experiment}" worked: ${CHECK_LABEL[r.targetCheck!]} went from ${b}% to ${a}% of days. Keep it.`
        : `"${r.experiment}" didn't move ${CHECK_LABEL[r.targetCheck!]} (${b}% → ${a}% of days), so we'll try something else.`,
    );
  }
  return lines;
}

/** When the scheduler should run an RCA. Pure; `lastReportAt` is the newest report of that trigger. */
export function rcaDue(input: {
  localDate: string;
  localHour: number;
  weekday: number;
  lastTwoDaysOffTrack: boolean;
  lastStreakReportAt: Date | null;
  lastWeeklyReportAt: Date | null;
  now: Date;
}): RcaTrigger | null {
  const since = (d: Date | null) => (d ? input.now.getTime() - d.getTime() : Infinity);
  if (input.weekday === 0 && input.localHour >= 18 && since(input.lastWeeklyReportAt) > 6 * DAY_MS) return "weekly_review";
  if (input.localHour >= 9 && input.lastTwoDaysOffTrack && since(input.lastStreakReportAt) > 4 * DAY_MS && since(input.lastWeeklyReportAt) > 2 * DAY_MS) {
    return "off_track_streak";
  }
  return null;
}
