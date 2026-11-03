/**
 * Pattern detectors: plain code over tables the app already fills, no model call. Each looks for
 * one way a plan stops fitting the person (an item that keeps slipping, a calorie target crossed
 * most days, weight stalled while logging...) and returns findings with the evidence in numbers.
 *
 * Thresholds are starting values from the PRD, kept here in one place to tune from real data.
 */
import type { CalorieReview } from "../calorieTarget.js";
import type { GoalProgress, MetricProgress } from "../goalProgress.js";
import type { HealthTargets } from "../northStar.js";
import type { DayRecord } from "../rca.js";
import { isGym, type RoutineItem } from "../routine.js";
import type { CauseId, Finding, ReasonChoice } from "./types.js";
import { DAY_MS } from "../../util/time.js";

export const T = {
  /** P1: misses among the last planned occurrences. */
  slipWindow: 5,
  slipMisses: 3,
  slipMinKnown: 4,
  /** P2: sessions done but at another time (hours off) or shorter (share of planned). */
  mismatchHours: 2,
  mismatchShort: 0.7,
  mismatchMin: 3,
  /** P3: the acceptable band around the calorie target, either side. */
  bandLow: 0.85,
  bandHigh: 1.1,
  bandOut7: 3,
  bandOut14: 6,
  proteinShare: 0.8,
  proteinDays7: 4,
  /** P4 */
  restrictShare: 0.7,
  reboundShare: 1.15,
  weekendLift: 1.25,
  /** P5 */
  stallLoggedShare: 0.8,
  stallPaceShare: 0.25,
  /** P6 */
  fadeDrop: 0.6,
  /** P7: weekly loss as a share of body weight, and deficit as a share of maintenance. */
  ambitiousPace: 0.0075,
  ambitiousDeficit: 0.25,
  /** P8: projected arrival this many days after the deadline. */
  driftDays: 21,
  /** Safety */
  fastLossShare: 0.01,
  /** No detector but safety and P7 fires in a goal's first week. */
  firstWeekDays: 7,
};

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type SessionRow = { key: string; localDate: string; startHour: number | null; durationMin: number | null };

export type DetectInput = {
  today: string;
  /** Complete days (today excluded), oldest first; the RCA's 21-day records. */
  records: DayRecord[];
  targets: HealthTargets;
  routine: RoutineItem[];
  routineChecks: Array<{ itemId: string; localDate: string; status: string; reason: string | null }>;
  gymChecks: Array<{ localDate: string; status: string; reason: string | null }>;
  /** Logged sessions: Hevy workouts as "gym", other activities by catalog key. */
  sessions: SessionRow[];
  goal: GoalProgress | null;
  review: CalorieReview | null;
  /** Higher of 1,200 kcal and BMR. */
  floorKcal: number;
  bmrKcal: number | null;
};

const dayN = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const kcal = (n: number) => `${Math.round(n).toLocaleString("en-US")} kcal`;
export const hhmm = (hour: number) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60 / 30) * 30;
  const hh = m === 60 ? h + 1 : h;
  return `${String(hh % 24).padStart(2, "0")}:${m === 60 ? "00" : String(m).padStart(2, "0")}`;
};
const hourOf = (t: string | null) => (t ? Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60 : null);

/** A skip reason in the person's words → the cause it points at. */
export function classifyReason(text: string | null | undefined): ReasonChoice | "pain" | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\b(pain|injur|hurt|sprain|strain|doctor)/.test(t)) return "pain";
  if (/\b(travel|trip|flight|away|sick|ill|fever|unwell|cold|cough|wedding|festival|holiday|vacation|out of town)/.test(t)) return "away";
  if (/\b(tired|sleep|exhausted|no energy|low energy|drained|sore|lazy)/.test(t)) return "energy";
  if (/\b(forgot|forget|slipped my mind)/.test(t)) return "forgot";
  if (/\b(bor(ed|ing)|don'?t (like|enjoy)|hate|motivation|didn'?t feel like|not in the mood)/.test(t)) return "enjoyment";
  if (/\b(time|work|late|busy|meeting|office|traffic|deadline|kids|family|guests|call)/.test(t)) return "time";
  return null;
}

export type ItemDay = { date: string; weekday: number; state: "done" | "missed" | "skipped" | null; reason: string | null };

/** Done / missed / skipped for each planned day of an item in the window (null = not known). */
export function itemHistory(item: RoutineItem, input: Pick<DetectInput, "records" | "routineChecks" | "gymChecks" | "sessions">): ItemDay[] {
  const gym = isGym(item);
  return input.records
    .filter((r) => item.days.includes(r.weekday))
    .map((r) => {
      let state: ItemDay["state"] = null;
      let reason: string | null = null;
      if (gym) {
        const c = input.gymChecks.find((x) => x.localDate === r.date);
        if (r.workout || c?.status === "found" || c?.status === "trained_unlogged") state = "done";
        else if (c?.status === "skipped") (state = "skipped"), (reason = c.reason);
        else if (c?.status === "missing") state = "missed";
      } else {
        const c = input.routineChecks.find((x) => x.itemId === item.id && x.localDate === r.date);
        if (c?.status === "done" || input.sessions.some((s) => s.key === item.activityKey && s.localDate === r.date)) state = "done";
        else if (c?.status === "skipped") (state = "skipped"), (reason = c.reason);
        else if (c?.status === "missing") state = "missed";
      }
      return { date: r.date, weekday: r.weekday, state, reason };
    });
}

/** Share of known planned days done, over `days` (null with fewer than 3 known). */
export function itemHitRate(days: ItemDay[]): number | null {
  const known = days.filter((d) => d.state !== null);
  return known.length >= 3 ? known.filter((d) => d.state === "done").length / known.length : null;
}

/** True when a recent skip says they're away, unwell or hurt: the item rests, no offer. */
function pausedByReason(days: ItemDay[], today: string): boolean {
  return days.some((d) => dayN(today) - dayN(d.date) <= 4 && (classifyReason(d.reason) === "away" || classifyReason(d.reason) === "pain"));
}

function sessionsFor(item: RoutineItem, input: Pick<DetectInput, "sessions">): SessionRow[] {
  return input.sessions.filter((s) => s.key === (isGym(item) ? "gym" : item.activityKey));
}

/** P1: one routine item missed or skipped 3 of its last 5 planned days, or 3 in a row. */
export function detectRoutineSlipping(item: RoutineItem, input: DetectInput): Finding | null {
  const days = itemHistory(item, input);
  const known = days.filter((d) => d.state !== null);
  if (known.length < T.slipMinKnown || pausedByReason(days, input.today)) return null;
  const last = known.slice(-T.slipWindow);
  const misses = last.filter((d) => d.state !== "done");
  const lastThree = known.slice(-3);
  const streak = lastThree.length === 3 && lastThree.every((d) => d.state !== "done");
  if (misses.length < T.slipMisses && !streak) return null;

  const done = last.length - misses.length;
  const evidence = [`${item.label} happened ${done} of the last ${last.length} planned times.`];
  const reasons = misses.map((d) => classifyReason(d.reason)).filter((r): r is ReasonChoice => !!r && r !== "pain");
  const said = misses.map((d) => d.reason).filter(Boolean) as string[];
  if (said.length) evidence.push(`You said: ${[...new Set(said)].slice(0, 3).map((s) => `"${s.slice(0, 60)}"`).join(", ")}.`);

  const facts: Finding["facts"] = { done, of: last.length, durationMin: item.durationMin, startTime: item.startTime };
  // Sessions done at another hour point at the time they actually train.
  const planned = hourOf(item.startTime);
  const hours = sessionsFor(item, input).map((s) => s.startHour).filter((h): h is number => h !== null);
  const off = planned === null ? [] : hours.filter((h) => Math.abs(h - planned) >= T.mismatchHours);
  if (off.length >= 2) {
    facts.observedTime = hhmm(median(off));
    evidence.push(`When it does happen it's usually around ${facts.observedTime}.`);
  }
  // A weekday that never works.
  const byWd = new Map<number, { n: number; m: number }>();
  for (const d of known) {
    const b = byWd.get(d.weekday) ?? { n: 0, m: 0 };
    b.n += 1;
    if (d.state !== "done") b.m += 1;
    byWd.set(d.weekday, b);
  }
  const worst = [...byWd.entries()].filter(([, b]) => b.n >= 2 && b.m === b.n).sort((a, b) => b[1].m - a[1].m)[0];
  if (worst) facts.worstWeekday = worst[0];
  const missWeekdays = new Set(misses.map((d) => d.weekday));

  let cause: CauseId = "unknown";
  const tally = new Map<ReasonChoice, number>();
  for (const r of reasons) tally.set(r, (tally.get(r) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[0] !== "away") cause = top[0];
  else if (facts.observedTime) cause = "time";
  else if (worst && known.filter((d) => d.state === "done").length >= 2) cause = "bad_weekday";
  else if (missWeekdays.size >= 3 && item.days.length >= 4) cause = "too_many_days";
  if (cause === "bad_weekday" && worst) evidence.push(`${WD[worst[0]]} hasn't worked once in the last three weeks.`);

  return {
    pattern: "routine_slipping",
    cause,
    area: `routine:${item.id}`,
    itemId: item.id,
    itemLabel: item.label,
    weight: misses.length + 1,
    evidence,
    facts,
  };
}

/** P2: the item happens, but at another time or for less time than planned. */
export function detectRoutineMismatch(item: RoutineItem, input: DetectInput): Finding | null {
  const s = sessionsFor(item, input).filter((x) => item.days.includes(new Date(`${x.localDate}T12:00:00Z`).getUTCDay()));
  if (s.length < T.mismatchMin) return null;
  const planned = hourOf(item.startTime);
  const hours = s.map((x) => x.startHour).filter((h): h is number => h !== null);
  const off = planned === null ? [] : hours.filter((h) => Math.abs(h - planned) >= T.mismatchHours);
  const mins = s.map((x) => x.durationMin).filter((m): m is number => m !== null && m > 0);
  const short = mins.filter((m) => m < item.durationMin * T.mismatchShort);
  const timeOff = off.length >= T.mismatchMin && off.length >= hours.length * 0.6;
  const shortOff = short.length >= T.mismatchMin && short.length >= mins.length * 0.6;
  if (!timeOff && !shortOff) return null;
  const facts: Finding["facts"] = { startTime: item.startTime, durationMin: item.durationMin };
  const evidence: string[] = [];
  if (timeOff) {
    facts.observedTime = hhmm(median(off));
    evidence.push(`${item.label} is planned for ${item.startTime}, but ${off.length} of your last ${hours.length} sessions started around ${facts.observedTime}.`);
  }
  if (shortOff) {
    facts.observedMin = Math.max(10, Math.round(median(short) / 5) * 5);
    evidence.push(`It's planned for ${item.durationMin} min; ${short.length} of the last ${mins.length} sessions took about ${facts.observedMin}.`);
  }
  return { pattern: "routine_mismatch", cause: "plan_mismatch", area: `routine:${item.id}`, itemId: item.id, itemLabel: item.label, weight: 1, evidence, facts };
}

/** Days with at least two meal sessions: logged well enough to judge intake. */
const judged = (rs: DayRecord[]) => rs.filter((r) => r.mealSessions >= 2);

/** P3 + safety: intake outside the band (either side), or protein short. */
export function detectIntake(input: DetectInput): Finding[] {
  const out: Finding[] = [];
  const target = input.targets.calorieTarget;
  const last14 = judged(input.records.slice(-14));
  const last7 = judged(input.records.slice(-7));
  if (target && last14.length >= 4) {
    const over = (rs: DayRecord[]) => rs.filter((r) => r.calories > target * T.bandHigh);
    const under = (rs: DayRecord[]) => rs.filter((r) => r.calories < target * T.bandLow);
    const o7 = over(last7).length, o14 = over(last14).length;
    const u7 = under(last7).length, u14 = under(last14).length;
    const overHit = o7 >= T.bandOut7 || o14 >= T.bandOut14;
    const underHit = u7 >= T.bandOut7 || u14 >= T.bandOut14;
    const review = input.review?.status === "ok" ? input.review : null;
    if (overHit && (!underHit || o14 >= u14)) {
      const days = over(last14);
      const gap = Math.round(avg(days.map((r) => r.calories - target)) / 10) * 10;
      const late = days.filter((r) => r.lastMealHour !== null && r.lastMealHour >= 21.5).length;
      const cause: CauseId = late >= Math.ceil(days.length * 0.6) ? "heavy_meal" : "target_strict";
      const evidence = [`You went over ${kcal(target)} on ${o7 >= T.bandOut7 ? `${o7} of the last ${last7.length}` : `${o14} of the last ${last14.length}`} logged days, by about ${kcal(gap)} on average.`];
      if (cause === "heavy_meal") evidence.push(`Most of those days ended with a meal after 9:30 pm.`);
      else evidence.push("That usually means the target is tighter than your week allows.");
      out.push({ pattern: "calories_over", cause, area: "nutrition", itemId: null, itemLabel: null, weight: Math.max(o7, Math.ceil(o14 / 2)) + 1, evidence, facts: { gap, target, over7: o7, over14: o14 } });
    } else if (underHit) {
      const days = under(last14);
      const avgIn = Math.round(avg(days.map((r) => r.calories)) / 10) * 10;
      const notLosing = review !== null && review.actualKgPerWeek > -0.1;
      const belowFloor = last7.filter((r) => r.calories < input.floorKcal).length;
      let cause: CauseId = "undereating";
      if (notLosing) cause = "under_logging";
      else if (target < input.floorKcal + 100) cause = "target_low";
      const evidence = [`You ate under ${kcal(target * T.bandLow)} on ${u7 >= T.bandOut7 ? `${u7} of the last ${last7.length}` : `${u14} of the last ${last14.length}`} logged days, about ${kcal(avgIn)} on those days.`];
      if (cause === "under_logging") evidence.push("Your weight isn't dropping the way that intake would make it, so some food is probably not getting logged.");
      else evidence.push("Eating well under the plan slows fat loss in the end and costs muscle.");
      const safety = cause !== "under_logging" && belowFloor >= 3;
      out.push({
        pattern: safety ? "safety" : "calories_under",
        cause,
        area: "nutrition",
        itemId: null,
        itemLabel: null,
        weight: safety ? 100 : Math.max(u7, Math.ceil(u14 / 2)) + 1,
        evidence: safety ? [`On ${belowFloor} of the last ${last7.length} logged days you ate under ${kcal(input.floorKcal)}, the least your body needs.`, ...evidence.slice(1)] : evidence,
        facts: { avgIntake: avgIn, target, under7: u7, under14: u14 },
      });
    }
  }
  const pt = input.targets.proteinTarget;
  if (pt && last7.length >= 4) {
    const short = last7.filter((r) => r.proteinG < pt * T.proteinShare);
    if (short.length >= T.proteinDays7) {
      const bySlot = ["breakfast", "lunch", "dinner"]
        .map((slot) => {
          const ds = last7.filter((r) => r.slots.includes(slot));
          return { slot, n: ds.length, avg: ds.length ? avg(ds.map((r) => r.proteinBySlot[slot] ?? 0)) : 0 };
        })
        .filter((x) => x.n >= 3)
        .sort((a, b) => a.avg - b.avg)[0];
      const avgP = Math.round(avg(last7.map((r) => r.proteinG)));
      out.push({
        pattern: "protein_short",
        cause: "protein_meal",
        area: "nutrition",
        itemId: null,
        itemLabel: null,
        weight: short.length,
        evidence: [`Protein was under ${Math.round(pt * T.proteinShare)} g on ${short.length} of the last ${last7.length} logged days, ${avgP} g on average vs ${pt} g.${bySlot ? ` ${bySlot.slot[0]!.toUpperCase()}${bySlot.slot.slice(1)} is the lightest, about ${Math.round(bySlot.avg)} g.` : ""}`],
        facts: { avgProtein: avgP, target: pt, slot: bySlot?.slot ?? null },
      });
    }
  }
  return out;
}

/** P4: a few light days then a big one, or weekends well above weekdays. */
export function detectRebound(input: DetectInput): Finding | null {
  const target = input.targets.calorieTarget;
  if (!target) return null;
  const rs = input.records.slice(-14);
  let rebounds = 0;
  for (let i = 2; i < rs.length; i++) {
    const a = rs[i - 2]!, b = rs[i - 1]!, c = rs[i]!;
    const light = (r: DayRecord) => r.mealSessions >= 2 && r.calories < target * T.restrictShare;
    if (light(a) && light(b) && c.mealSessions >= 1 && c.calories > target * T.reboundShare) rebounds++;
  }
  if (rebounds >= 2) {
    return { pattern: "rebound", cause: "early_restriction", area: "nutrition", itemId: null, itemLabel: null, weight: rebounds * 2, evidence: [`Twice in two weeks, two light days were followed by a day well over ${kcal(target)}.`, "Eating too little early on usually comes back as hunger later."], facts: { rebounds } };
  }
  const logged = judged(input.records);
  const we = logged.filter((r) => r.weekday === 0 || r.weekday === 6);
  const wd = logged.filter((r) => r.weekday !== 0 && r.weekday !== 6);
  if (we.length >= 2 && wd.length >= 4) {
    const weA = avg(we.map((r) => r.calories)), wdA = avg(wd.map((r) => r.calories));
    if (wdA > 0 && weA >= wdA * T.weekendLift) {
      return {
        pattern: "rebound",
        cause: "weekend",
        area: "nutrition",
        itemId: null,
        itemLabel: null,
        weight: we.length,
        evidence: [`Weekends average ${kcal(weA)} vs ${kcal(wdA)} on weekdays.`],
        facts: { weekendAvg: Math.round(weA), weekdayAvg: Math.round(wdA) },
      };
    }
  }
  return null;
}

function weightMetric(goal: GoalProgress | null): MetricProgress | null {
  return goal?.metrics.find((m) => m.metric === "weight_kg") ?? null;
}

/** P5: logging well, weight not moving the way the goal needs. */
export function detectStalled(input: DetectInput): Finding | null {
  const m = weightMetric(input.goal);
  const review = input.review?.status === "ok" ? input.review : null;
  if (!m || !review || m.requiredPerWeek === null || m.requiredPerWeek === 0 || m.pace === "reached") return null;
  const logged = input.records.filter((r) => r.mealSessions > 0).length;
  if (input.records.length < 14 || logged < input.records.length * T.stallLoggedShare || review.weighIns < 3) return null;
  const need = m.requiredPerWeek;
  const actual = review.actualKgPerWeek;
  const stalled = Math.sign(actual) !== Math.sign(need) || Math.abs(actual) < Math.abs(need) * T.stallPaceShare;
  if (!stalled) return null;

  const evidence = [`Weight has moved ${actual > 0 ? "+" : ""}${actual.toFixed(2)} kg a week over ${review.weighIns} weigh-ins while you logged ${logged} of ${input.records.length} days; the goal needs ${need.toFixed(2)}.`];
  const facts: Finding["facts"] = { actualPerWeek: actual, neededPerWeek: need, avgIntake: review.avgIntakeKcal, maintenance: review.maintenanceKcal };
  let cause: CauseId | null = null;
  const bf = input.goal?.metrics.find((x) => x.metric === "body_fat_pct");
  if (bf && bf.actualPerWeek !== null && bf.requiredPerWeek !== null && Math.sign(bf.actualPerWeek) === Math.sign(bf.requiredPerWeek) && Math.abs(bf.actualPerWeek) >= Math.abs(bf.requiredPerWeek) * 0.5) {
    cause = "recomp";
    evidence.push(`Body fat is moving the right way (${bf.actualPerWeek.toFixed(2)}% a week), so you're likely losing fat and gaining muscle at the same time.`);
  } else if (input.bmrKcal && need < 0 && review.avgIntakeKcal < input.bmrKcal * 1.15) {
    cause = "under_logging";
    evidence.push(`The logs say about ${kcal(review.avgIntakeKcal)} a day, close to what your body burns at rest, yet weight is flat: some things are probably not getting logged, like cooking oil, chai or weekend meals.`);
  } else {
    const recent = avg(input.records.slice(-7).map((r) => r.steps));
    const before = avg(input.records.slice(0, -7).map((r) => r.steps));
    if (before > 3000 && recent < before * 0.8) {
      cause = "steps_dropped";
      facts.stepsBefore = Math.round(before / 500) * 500;
      evidence.push(`Steps dropped from about ${Math.round(before).toLocaleString("en-US")} to ${Math.round(recent).toLocaleString("en-US")} a day this week.`);
    } else if (review.recommend && (review.change ?? 0) < 0) {
      cause = "above_maintenance";
      facts.suggestedTarget = review.suggestedTarget;
      evidence.push(`Your maintenance works out to about ${kcal(review.maintenanceKcal)}, so ${kcal(review.suggestedTarget)} is the target that moves weight at the pace you need.`);
    }
  }
  return { pattern: "stalled", cause: cause ?? "unknown", area: "goal", itemId: null, itemLabel: null, weight: 6, evidence, facts };
}

/** P6: logging is tailing off after a good stretch. */
export function detectLoggingFading(input: DetectInput): Finding | null {
  const rs = input.records;
  if (rs.length < 14) return null;
  const last7 = rs.slice(-7), prev7 = rs.slice(-14, -7);
  const a = avg(last7.map((r) => r.mealSessions)), b = avg(prev7.map((r) => r.mealSessions));
  const empty5 = rs.slice(-5).filter((r) => r.mealSessions === 0).length;
  const goodDays = rs.slice(0, -5).filter((r) => r.mealSessions >= 2).length;
  if ((b >= 2 && a <= b * T.fadeDrop) || (empty5 >= 2 && goodDays >= 10)) {
    return {
      pattern: "logging_fading",
      cause: "logging_effort",
      area: "logging",
      itemId: null,
      itemLabel: null,
      weight: 3,
      evidence: [empty5 >= 2 ? `Nothing was logged on ${empty5} of the last 5 days, after a strong couple of weeks.` : `Meals logged per day went from about ${b.toFixed(1)} to ${a.toFixed(1)} this week.`, "Logging that feels like work is the usual reason; let's make it lighter."],
      facts: { before: Math.round(b * 10) / 10, after: Math.round(a * 10) / 10 },
    };
  }
  return null;
}

/** P7: the goal needs a pace that's unsafe or rarely kept. Runs at goal set and nightly. */
export function detectOverAmbitious(input: DetectInput): Finding | null {
  const m = weightMetric(input.goal);
  const review = input.review?.status === "ok" ? input.review : null;
  if (!m || m.latest === null || m.requiredPerWeek === null || m.requiredPerWeek >= 0) return null;
  const share = -m.requiredPerWeek / m.latest;
  const deficitShare = review && input.targets.calorieTarget ? (review.maintenanceKcal - input.targets.calorieTarget) / review.maintenanceKcal : 0;
  if (share <= T.ambitiousPace && deficitShare <= T.ambitiousDeficit) return null;
  const evidence = share > T.ambitiousPace
    ? [`Reaching ${m.target} kg by ${input.goal!.goal.deadline} needs ${(-m.requiredPerWeek).toFixed(2)} kg a week, ${(share * 100).toFixed(1)}% of your weight. Plans that fast are rarely kept.`]
    : [`Your target is ${Math.round(deficitShare * 100)}% under your maintenance of about ${kcal(review!.maintenanceKcal)}. Deficits that deep are hard to keep up.`];
  return { pattern: "over_ambitious", cause: "pace", area: "goal", itemId: null, itemLabel: null, weight: 5, evidence, facts: { neededPerWeek: m.requiredPerWeek, latest: m.latest, target: m.target } };
}

/** P8: at the current pace the goal lands well after the deadline. */
export function detectDeadlineDrift(input: DetectInput): Finding | null {
  const m = weightMetric(input.goal);
  if (!m || !input.goal || m.pace !== "behind" || !m.projectedDate || m.actualPerWeek === null) return null;
  if (dayN(m.projectedDate) - dayN(input.goal.goal.deadline) <= T.driftDays) return null;
  return {
    pattern: "deadline_drift",
    cause: "pace",
    area: "goal",
    itemId: null,
    itemLabel: null,
    weight: 4,
    evidence: [`At your pace over the last few weeks (${m.actualPerWeek.toFixed(2)} kg a week) you reach ${m.target} kg around ${m.projectedDate}, not ${input.goal.goal.deadline}.`],
    facts: { projectedDate: m.projectedDate, actualPerWeek: m.actualPerWeek },
  };
}

/** Safety: losing faster than 1% of body weight a week. */
export function detectTooFast(input: DetectInput): Finding | null {
  const review = input.review?.status === "ok" ? input.review : null;
  if (!review || review.weighIns < 3) return null;
  if (review.actualKgPerWeek >= -T.fastLossShare * review.trendWeightKg) return null;
  return {
    pattern: "safety",
    cause: "too_fast",
    area: "nutrition",
    itemId: null,
    itemLabel: null,
    weight: 100,
    evidence: [`You're losing about ${(-review.actualKgPerWeek).toFixed(2)} kg a week, more than 1% of your weight. That pace costs muscle and is hard on the body.`],
    facts: { actualPerWeek: review.actualKgPerWeek, maintenance: review.maintenanceKcal },
  };
}

/** Every finding for today, before cooldowns and caps. */
export function detectAll(input: DetectInput): Finding[] {
  const out: Finding[] = [];
  const fast = detectTooFast(input);
  if (fast) out.push(fast);
  const intake = detectIntake(input);
  out.push(...intake.filter((f) => f.pattern === "safety"));

  const goalStart = input.goal?.goal.startDate;
  const firstWeek = goalStart ? dayN(input.today) - dayN(goalStart) < T.firstWeekDays : false;
  const ambitious = detectOverAmbitious(input);
  if (ambitious) out.push(ambitious);
  if (firstWeek) return out;

  for (const item of input.routine) {
    const slip = detectRoutineSlipping(item, input);
    if (slip) out.push(slip);
    else {
      const mis = detectRoutineMismatch(item, input);
      if (mis) out.push(mis);
    }
  }
  out.push(...intake.filter((f) => f.pattern !== "safety"));
  for (const f of [detectRebound(input), detectStalled(input), detectLoggingFading(input), detectDeadlineDrift(input)]) if (f) out.push(f);
  return out;
}
