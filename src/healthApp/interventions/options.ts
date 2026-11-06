/**
 * What the coach offers for a finding: two or three concrete changes, each with its effect on the
 * goal date, plus the card's title. Plain templates, no model call.
 *
 * Rules from the PRD (Saksham, 3 Nov):
 * - Every option shows its goal impact: "goal date stays 1 Feb" or "goal moves to 14 Mar".
 * - Options that keep the deadline go first.
 * - When no easier option keeps the deadline, the card says the current plan is what gets there
 *   on time and recommends sticking to it; the easier plan is the alternative.
 * - Never more than 6 months past the original deadline: past that, or never, it's a rethink.
 * - Never below the calorie floor (higher of 1,200 and BMR) or faster than 1% a week.
 */
import type { CalorieReview } from "../calorieTarget.js";
import type { GoalProgress } from "../goalProgress.js";
import type { HealthTargets } from "../northStar.js";
import type { RoutineItem } from "../routine.js";
import { T } from "./detectors.js";
import type { Change, Finding, GoalImpact, Option, OptionKind } from "./types.js";
import { DAY_MS, dateOf } from "../../util/time.js";

export const KCAL_PER_KG = 7700;
export const MAX_EXTENSION_DAYS = 182;
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type OfferContext = {
  today: string;
  targets: HealthTargets;
  review: CalorieReview | null;
  goal: GoalProgress | null;
  /** The deadline of the first plan for this goal; extensions are capped against it. */
  originalDeadline: string | null;
  floorKcal: number;
  item: RoutineItem | null;
};

const dayN = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const r50 = (n: number) => Math.round(n / 50) * 50;
const r5 = (n: number) => Math.round(n / 5) * 5;
const kcal = (n: number) => `${Math.round(n).toLocaleString("en-US")} kcal`;

/** "14 Mar" (with the year when it isn't this year's). */
export function shortDate(date: string, today?: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const s = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return today && date.slice(0, 4) !== today.slice(0, 4) ? `${s} ${date.slice(0, 4)}` : s;
}

function weight(ctx: OfferContext) {
  const m = ctx.goal?.metrics.find((x) => x.metric === "weight_kg") ?? null;
  const review = ctx.review?.status === "ok" ? ctx.review : null;
  const trend = review?.trendWeightKg ?? m?.latest ?? null;
  return { m, review, trend, target: m?.target ?? null };
}

/** The date a calorie target reaches the weight goal; "never" when it moves the wrong way; null when unknown. */
export function dateForTarget(ctx: OfferContext, calories: number): string | "never" | null {
  const { review, trend, target } = weight(ctx);
  if (!review || trend === null || target === null) return null;
  const perDay = (calories - review.maintenanceKcal) / KCAL_PER_KG;
  const need = target - trend;
  if (Math.abs(need) < 0.1) return ctx.today;
  if (perDay === 0 || Math.sign(perDay) !== Math.sign(need)) return "never";
  return dateOf(dayN(ctx.today) + Math.ceil(need / perDay));
}

export function capDate(ctx: OfferContext): string | null {
  const base = ctx.originalDeadline ?? ctx.goal?.goal.deadline ?? null;
  return base ? dateOf(dayN(base) + MAX_EXTENSION_DAYS) : null;
}

function keepsImpact(ctx: OfferContext): GoalImpact {
  const d = ctx.goal?.goal.deadline;
  return d ? { kind: "keeps", date: d, text: `Goal date stays ${shortDate(d, ctx.today)}` } : { kind: "none", date: null, text: "" };
}

export function impactOf(ctx: OfferContext, change: Change): GoalImpact {
  const deadline = ctx.goal?.goal.deadline ?? null;
  if (!deadline) return { kind: "none", date: null, text: "" };
  if (change.deadline) return { kind: "moves", date: change.deadline, text: `Goal moves to ${shortDate(change.deadline, ctx.today)}` };
  const cal = change.targets?.calorieTarget;
  if (cal !== undefined) {
    const d = dateForTarget(ctx, cal);
    if (d === null) return { kind: "none", date: null, text: "Goal date: clearer after the next weigh-ins" };
    if (d === "never") return { kind: "moves", date: null, text: "At this target the goal isn't reached" };
    // Within a week of the deadline counts as keeping it: weigh-ins are weekly.
    if (dayN(d) <= dayN(deadline) + 7) return keepsImpact(ctx);
    return { kind: "moves", date: d, text: `Goal moves to ${shortDate(d, ctx.today)}` };
  }
  return keepsImpact(ctx);
}

function opt(ctx: OfferContext, id: string, label: string, kind: OptionKind, change: Change, prompt?: string): Option {
  return { id, label, kind, change, impact: kind === "talk" ? { kind: "none", date: null, text: "" } : impactOf(ctx, change), ...(prompt ? { prompt } : {}) };
}

function itemOptions(f: Finding, ctx: OfferContext): Option[] {
  const it = ctx.item;
  if (!it) return [];
  const out: Option[] = [];
  const patch = (id: string, label: string, p: NonNullable<Change["routineItem"]>["patch"]) => out.push(opt(ctx, id, label, "change", { routineItem: { itemId: it.id, patch: p } }));
  const planned = it.startTime ? Number(it.startTime.slice(0, 2)) : null;
  const observed = typeof f.facts.observedTime === "string" ? f.facts.observedTime : null;
  const shorter = Math.max(20, r5(it.durationMin * 0.6));
  const worst = typeof f.facts.worstWeekday === "number" ? f.facts.worstWeekday : null;
  const moveTime = () => {
    if (observed) patch("move_time", `Move it to ${observed}`, { startTime: observed });
    else if (planned !== null) {
      const alt = planned < 12 ? "18:30" : "07:00";
      patch("move_time", `Try ${alt} instead`, { startTime: alt });
    }
  };
  const shorten = () => { if (shorter < it.durationMin) patch("shorter", `Make it ${shorter} min`, { durationMin: shorter }); };
  const dropDay = () => {
    if (it.days.length < 3) return;
    const day = worst ?? it.days[it.days.length - 1]!;
    patch("drop_day", `Drop ${WD[day]}: ${it.days.length - 1} days a week`, { days: it.days.filter((d) => d !== day) });
  };

  switch (f.cause) {
    case "plan_mismatch": {
      const p: NonNullable<Change["routineItem"]>["patch"] = {};
      const bits: string[] = [];
      if (observed) (p.startTime = observed), bits.push(observed);
      if (typeof f.facts.observedMin === "number") (p.durationMin = f.facts.observedMin), bits.push(`${f.facts.observedMin} min`);
      patch("match", `Make ${bits.join(", ")} the plan`, p);
      break;
    }
    case "time":
      moveTime();
      shorten();
      dropDay();
      break;
    case "length":
      shorten();
      out.push(opt(ctx, "minimum", "A 25-min version on busy days", "experiment", { experiment: `On busy days, do a 25-minute ${it.label.toLowerCase()} instead of skipping it.` }));
      break;
    case "too_many_days":
      dropDay();
      shorten();
      break;
    case "bad_weekday": {
      if (worst !== null) {
        const free = [1, 2, 3, 4, 5, 6, 0].map((k) => (worst + k) % 7).find((d) => !it.days.includes(d));
        if (free !== undefined) patch("swap_day", `Move ${WD[worst]} to ${WD[free]}`, { days: [...it.days.filter((d) => d !== worst), free].sort((a, b) => a - b) });
      }
      dropDay();
      break;
    }
    case "energy":
      shorten();
      out.push(opt(ctx, "light_day", "A 20-min walk on tired days", "experiment", { experiment: `On days you're tired or slept badly, take a 20-minute walk instead of ${it.label.toLowerCase()}.` }));
      break;
    case "enjoyment":
      out.push(opt(ctx, "try_other", "Try something else once this week", "experiment", { experiment: `Swap one ${it.label.toLowerCase()} this week for something you enjoy: a swim, a sport or a class.` }));
      out.push(opt(ctx, "swap", "Swap it for an activity I like", "talk", {}, `I'd like to swap ${it.label.toLowerCase()} for something I enjoy more.`));
      break;
    case "forgot":
      if (!it.remindBeforeMin) patch("remind", "Remind me 30 min before", { remindBeforeMin: 30 });
      out.push(opt(ctx, "kit", "Set things up the night before", "experiment", { experiment: `Put out what you need for ${it.label.toLowerCase()} the night before.` }));
      break;
    default:
      moveTime();
      shorten();
      dropDay();
  }
  return out;
}

function targetOption(ctx: OfferContext, id: string, label: string, calories: number): Option | null {
  const t = Math.max(ctx.floorKcal, r50(calories));
  if (ctx.targets.calorieTarget !== null && t === ctx.targets.calorieTarget) return null;
  return opt(ctx, id, label.replace("{t}", kcal(t)), "change", { targets: { calorieTarget: t } });
}

function nutritionOptions(f: Finding, ctx: OfferContext): Option[] {
  const cur = ctx.targets.calorieTarget;
  const review = ctx.review?.status === "ok" ? ctx.review : null;
  const out: Array<Option | null> = [];
  const maint = review?.maintenanceKcal ?? null;
  // Relaxing never goes past maintenance on a weight-loss goal.
  const relax = (by: number) => (cur ? Math.min(cur + by, maint !== null && maint > cur ? maint - 100 : cur + by) : null);
  switch (f.cause) {
    case "target_strict":
      if (cur) {
        out.push(targetOption(ctx, "relax_small", "Set {t}", relax(150)!));
        out.push(targetOption(ctx, "relax_more", "Set {t}", relax(250)!));
      }
      out.push(opt(ctx, "plan_ahead", `Keep ${cur ? kcal(cur) : "the target"}, plan the day each morning`, "experiment", { experiment: "Each morning, plan the day's meals in the app before eating, so the evening isn't a surprise." }));
      break;
    case "heavy_meal":
      out.push(opt(ctx, "dinner_first", "Plan dinner first, lighter lunch", "experiment", { experiment: "Decide dinner first and keep lunch lighter so dinner fits the day's target." }));
      if (cur) out.push(targetOption(ctx, "relax_small", "Set {t}", relax(150)!));
      break;
    case "under_logging":
      out.push(opt(ctx, "full_log", "Try a full-logging week", "experiment", { experiment: "For 7 days, log everything: cooking oil, chai and coffee, drinks, snacks and weekend meals." }));
      if (review?.recommend) out.push(targetOption(ctx, "recalibrate", "Recalibrate to {t}", review.suggestedTarget));
      break;
    case "undereating":
      out.push(opt(ctx, "add_meal", "Add a planned snack with protein", "experiment", { experiment: `Add a planned breakfast or snack with protein so each day reaches at least ${kcal(Math.max(ctx.floorKcal, (cur ?? 0) * T.bandLow))}.` }));
      break;
    case "target_low":
    case "too_fast":
      if (maint !== null) out.push(targetOption(ctx, "raise", "Raise the target to {t}", Math.max(ctx.floorKcal, maint - 500)));
      else if (cur !== null && cur < ctx.floorKcal) out.push(targetOption(ctx, "raise", "Raise the target to {t}", ctx.floorKcal));
      out.push(opt(ctx, "eat_floor", `Eat at least ${kcal(ctx.floorKcal)} every day`, "experiment", { experiment: `Eat at least ${kcal(ctx.floorKcal)} every day this week.` }));
      break;
    case "protein_meal": {
      const slot = typeof f.facts.slot === "string" ? f.facts.slot : "the lightest meal";
      out.push(opt(ctx, "protein_slot", `Add about 20 g protein to ${slot}`, "experiment", { experiment: `Add about 20 g of protein to ${slot} every day, from a food you already eat.` }));
      out.push(opt(ctx, "protein_ideas", "Find protein that fits my diet", "talk", {}, "Help me find easy protein additions that fit my diet."));
      break;
    }
    case "early_restriction":
      out.push(opt(ctx, "breakfast", "A proper breakfast with protein daily", "experiment", { experiment: "Eat a proper breakfast with protein every day this week, even when you plan to eat light." }));
      break;
    case "weekend":
      out.push(opt(ctx, "weekly_total", "Plan the weekend into the week", "experiment", { experiment: "Keep weekdays about 150 kcal under target so the weekend fits the same weekly total." }));
      if (cur) out.push(targetOption(ctx, "relax_small", "Set {t}", relax(150)!));
      break;
    default:
      break;
  }
  return out.filter((o): o is Option => o !== null);
}

/** What "Talk it through" sends on a goal-pace card. Matches the card: fix the goal, nothing about milestones. */
export const GOAL_TALK_PROMPT = "Help me fix my goal.";

/** A goal date the pace can keep: the safe pace for over-ambitious, the trend for drift. */
function laterDeadline(f: Finding, ctx: OfferContext): string | null {
  const m = ctx.goal?.metrics.find((x) => x.metric === "weight_kg");
  if (!m || m.latest === null) return null;
  if (f.pattern === "deadline_drift" && typeof f.facts.projectedDate === "string") return f.facts.projectedDate;
  const perWeek = T.ambitiousPace * m.latest;
  const weeks = Math.ceil(Math.abs(m.latest - m.target) / perWeek);
  return dateOf(dayN(ctx.today) + weeks * 7);
}

function goalOptions(f: Finding, ctx: OfferContext): Option[] {
  const out: Array<Option | null> = [];
  const review = ctx.review?.status === "ok" ? ctx.review : null;
  switch (f.cause) {
    case "pace": {
      const d = laterDeadline(f, ctx);
      if (d && ctx.goal && d > ctx.goal.goal.deadline) out.push(opt(ctx, "new_date", `Move the goal to ${shortDate(d, ctx.today)}`, "change", { deadline: d }));
      out.push(opt(ctx, "fix_goal", "Fix my goal together", "talk", {}, GOAL_TALK_PROMPT));
      break;
    }
    case "above_maintenance":
      if (typeof f.facts.suggestedTarget === "number") out.push(targetOption(ctx, "recalibrate", "Recalibrate to {t}", f.facts.suggestedTarget));
      break;
    case "steps_dropped":
      out.push(opt(ctx, "walk", "A 15-min walk after lunch", "experiment", { experiment: "Take a 15-minute walk after lunch every day." }));
      if (typeof f.facts.stepsBefore === "number" && f.facts.stepsBefore > ctx.targets.stepTarget) {
        out.push(opt(ctx, "step_floor", `Step target ${f.facts.stepsBefore.toLocaleString("en-US")}`, "change", { targets: { stepTarget: f.facts.stepsBefore } }));
      }
      break;
    case "under_logging":
      out.push(opt(ctx, "full_log", "Try a full-logging week", "experiment", { experiment: "For 7 days, log everything: cooking oil, chai and coffee, drinks, snacks and weekend meals." }));
      if (review?.recommend) out.push(targetOption(ctx, "recalibrate", "Recalibrate to {t}", review.suggestedTarget));
      break;
    case "logging_effort":
      out.push(opt(ctx, "dinner_only", "Log just dinner for a week", "experiment", { experiment: "For a week, log just dinner. The coach fills in the rest from your usual meals." }));
      out.push(opt(ctx, "quick", "Use one-tap logs for repeat meals", "experiment", { experiment: "Log repeat meals with one tap from your frequent meals on the Log screen." }));
      break;
    case "recomp":
      break;
    default:
      out.push(opt(ctx, "dig", "Help me find why", "talk", {}, "Help me find why my weight isn't moving."));
  }
  return out.filter((o): o is Option => o !== null);
}

export const TITLES: Record<string, (f: Finding) => string> = {
  routine_slipping: (f) => `${f.itemLabel ?? "This session"} isn't fitting your week`,
  routine_mismatch: (f) => `${f.itemLabel ?? "This session"}: let the plan match what you do`,
  calories_over: () => "The calorie target looks too tight",
  calories_under: (f) => (f.cause === "under_logging" ? "Some food may not be getting logged" : "You're eating less than the plan"),
  protein_short: () => "Protein is running short",
  rebound: (f) => (f.cause === "weekend" ? "Weekends are carrying the week" : "Light days are coming back as big ones"),
  stalled: (f) => (f.cause === "recomp" ? "Weight is flat, but body fat is dropping" : "Weight isn't moving yet"),
  logging_fading: () => "Let's make logging lighter",
  over_ambitious: () => "This goal date needs a very fast pace",
  deadline_drift: () => "The goal date is drifting",
  safety: (f) => (f.cause === "too_fast" ? "You're losing weight too fast" : "You're eating less than your body needs"),
};

export type Offer = { title: string; options: Option[]; recommendation: string | null };

/** The card's title, options (deadline-keeping first, capped) and the stick-to-plan line. */
export function buildOffer(f: Finding, ctx: OfferContext): Offer {
  let options = f.area.startsWith("routine:") ? itemOptions(f, ctx) : f.area === "nutrition" ? nutritionOptions(f, ctx) : goalOptions(f, ctx);
  if (f.area === "logging") options = goalOptions(f, ctx);

  // 6-month cap on extensions; "never" is a rethink, not an option.
  const cap = capDate(ctx);
  const beyond = (o: Option) => o.impact.kind === "moves" && (o.impact.date === null || (cap !== null && o.impact.date > cap));
  const dropped = options.filter(beyond);
  options = options.filter((o) => !beyond(o));
  if (dropped.length && !options.some((o) => o.kind === "talk")) {
    options.push({ id: "rethink", label: "Rethink the goal together", kind: "talk", change: {}, impact: { kind: "none", date: null, text: "" }, prompt: "My goal looks out of reach on this plan. Help me fix my goal." });
  }

  const rank = (o: Option) => (o.kind === "talk" ? 2 : o.impact.kind === "moves" ? 1 : 0);
  options = options.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map((x) => x.o).slice(0, 3);

  let recommendation: string | null = null;
  const real = options.filter((o) => o.kind !== "talk");
  const deadline = ctx.goal?.goal.deadline;
  // Safety findings never tell anyone to stick to an unsafe plan.
  if (f.pattern !== "safety" && deadline && real.length && real.every((o) => o.impact.kind === "moves")) {
    recommendation = `Your current plan is what gets you there by ${shortDate(deadline, ctx.today)}; the easier options below move that date. Sticking with it is my suggestion.`;
  }
  return { title: TITLES[f.pattern]!(f), options, recommendation };
}

/** Words the coach never uses on a card (PRD tone rules). */
export const BANNED = /\b(fail(ed|ure)?|missed again|cheat|discipline|no excuses|should have|lazy|guilt(y)?|bad food|get back on track)\b/i;
