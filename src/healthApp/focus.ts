/**
 * One way to rank what the coach raises, shared by the nightly note, the weekly review, the
 * root-cause analysis and the interventions (Saksham, 11 Nov: the coach kept flagging protein, a
 * gap his own meal plan made, while calories were the bigger hit to his goal).
 *
 * Gates come first, then weight:
 * - Unlogged days (and, once they exist, partly logged days for food checks) aren't misses.
 * - A protein miss the meal plan itself can't fix (plan protein gap, not decided yet) isn't raised
 *   as theirs: the Meals tab asks them what to do about it.
 * - What moves the goal weighs more: when weight is behind the pace the deadline needs, calories
 *   (the lever on weight) count more than the checks that don't move it directly.
 * - Nothing fires on an on-track, logged day, and a single miss isn't a focus (no fixed "issue
 *   of the day"): a check needs to be missed on 2 or more logged days in the window.
 */
import type { CheckId } from "./northStar.js";
import type { GoalProgress } from "./goalProgress.js";

export type FocusContext = {
  /** The meal plan can't reach the protein target under their food rules and they haven't decided what to do. */
  proteinPlanShort: boolean;
  /** Weight is behind the pace the goal deadline needs. */
  weightBehind: boolean;
};

export const NO_FOCUS_CONTEXT: FocusContext = { proteinPlanShort: false, weightBehind: false };

/** How much more a check that moves weight counts while weight is behind pace. */
export const BEHIND_WEIGHT = 1.5;

const FOOD_CHECKS: ReadonlySet<string> = new Set(["calories", "protein", "macros", "meals_logged"]);

/** The goal side of the context from goal progress (pure). */
export function focusContext(goal: Pick<GoalProgress, "metrics"> | null | undefined, proteinPlanShort = false): FocusContext {
  const weight = goal?.metrics.find((m) => m.metric === "weight_kg");
  return { proteinPlanShort, weightBehind: weight?.pace === "behind" };
}

/** The plan's protein gap line says nothing has been decided yet (proteinGap.ts gapLine). Pure. */
export const gapUndecided = (line: string | null | undefined): boolean => !!line && /Not decided yet/.test(line);

/** A check's weight for ranking, from its own base weight (usually days missed). 0 = don't raise it. Pure. */
export function focusWeight(check: CheckId | string | null | undefined, base: number, ctx: FocusContext): number {
  if (check === "protein" && ctx.proteinPlanShort) return 0;
  if (check === "calories" && ctx.weightBehind) return base * BEHIND_WEIGHT;
  return base;
}

type FocusDay = {
  unlogged?: boolean;
  /** Logged, but not every meal (lapsed-logging work): food checks aren't judged on it. */
  partial?: boolean;
  checks: Array<{ id: CheckId | string; label: string; met: boolean; progress?: number }>;
};

export type Focus = {
  id: string;
  label: string;
  missedDays: number;
  judgedDays: number;
  /** Missed on most of the judged days: decode it and change the plan or routine, not repeat the tip. */
  pattern: boolean;
};

/**
 * The one thing worth raising from these days, or null when nothing qualifies. Severity is how far
 * off the misses were (1 - progress), so a near miss counts less than a wide one. Pure.
 */
export function pickFocus(days: FocusDay[], ctx: FocusContext, opts: { minDays?: number } = {}): Focus | null {
  const minDays = opts.minDays ?? 2;
  const logged = days.filter((d) => !d.unlogged);
  const tally = new Map<string, { label: string; missed: number; judged: number; gap: number }>();
  for (const d of logged) {
    for (const c of d.checks) {
      if (c.id === "meals_logged") continue;
      if (d.partial && FOOD_CHECKS.has(String(c.id))) continue;
      const t = tally.get(String(c.id)) ?? { label: c.label, missed: 0, judged: 0, gap: 0 };
      t.judged++;
      if (!c.met) {
        t.missed++;
        t.gap += 1 - Math.max(0, Math.min(1, c.progress ?? 0));
      }
      tally.set(String(c.id), t);
    }
  }
  let best: (Focus & { score: number }) | null = null;
  for (const [id, t] of tally) {
    if (t.missed < minDays) continue;
    const severity = 0.5 + 0.5 * (t.gap / t.missed);
    const score = focusWeight(id, t.missed * severity, ctx);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { id, label: t.label, missedDays: t.missed, judgedDays: t.judged, pattern: t.missed >= Math.max(3, Math.ceil(t.judged / 2)), score };
  }
  if (!best) return null;
  const { score: _s, ...focus } = best;
  return focus;
}

// ---------- loading ----------

/** Whether the meal plan is short on protein under their rules with nothing decided yet. */
export async function loadProteinPlanShort(userProfileId: string, timezone: string, now: Date): Promise<boolean> {
  const { planViewOrNull } = await import("./dietPlan/rhythm.js");
  const view = await planViewOrNull({ userProfileId, timezone, now } as never, now).catch(() => null);
  return !!view?.proteinGap && !view.proteinGap.answered;
}

/** The context for a person; pass goal progress when the caller already has it. */
export async function loadFocusContext(userProfileId: string, timezone: string, now: Date, goal?: Pick<GoalProgress, "metrics"> | null): Promise<FocusContext> {
  const [short, progress] = await Promise.all([
    loadProteinPlanShort(userProfileId, timezone, now).catch(() => false),
    goal !== undefined ? Promise.resolve(goal) : loadGoalProgress(userProfileId, timezone, now).catch(() => null),
  ]);
  return focusContext(progress, short);
}

async function loadGoalProgress(userProfileId: string, timezone: string, now: Date): Promise<GoalProgress | null> {
  const [{ getActiveGoal, getBodyCheckins }, { computeGoalProgress }, { localDateKey }] = await Promise.all([import("./bodyStore.js"), import("./goalProgress.js"), import("../nutrition/localDate.js")]);
  const goal = await getActiveGoal(userProfileId);
  if (!goal) return null;
  const today = localDateKey(now, timezone);
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - 180 * 86_400_000).toISOString().slice(0, 10);
  return computeGoalProgress(goal, await getBodyCheckins(userProfileId, from), today);
}
