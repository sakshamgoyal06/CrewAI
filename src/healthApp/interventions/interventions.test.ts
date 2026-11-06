import { describe, expect, it, vi } from "vitest";

vi.mock("../../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import type { CalorieReview } from "../calorieTarget.js";
import type { GoalProgress, MetricProgress } from "../goalProgress.js";
import type { HealthTargets } from "../northStar.js";
import type { DayRecord } from "../rca.js";
import { evidenceSignature, reusableInsight, type RcaReport } from "../rca.js";
import type { RoutineItem } from "../routine.js";
import { cardFromIntervention, interventionNote, interventionsLine } from "./card.js";
import {
  classifyReason,
  detectAll,
  detectDeadlineDrift,
  detectIntake,
  detectLoggingFading,
  detectOverAmbitious,
  detectRebound,
  detectRoutineMismatch,
  detectRoutineSlipping,
  detectStalled,
  detectTooFast,
  type DetectInput,
} from "./detectors.js";
import { calorieFloor, measure, selectFinding } from "./engine.js";
import { BANNED, buildOffer, capDate, dateForTarget, impactOf, type OfferContext } from "./options.js";
import { agreedSnapshot, beforeOf, originalDeadline, withChange, type PlanSnapshot, type PlanVersion } from "./plan.js";
import type { Finding, Intervention } from "./types.js";

const DAY = 86_400_000;
const TODAY = "2026-11-03"; // a Tuesday
const dateBack = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
const wdOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

const targets: HealthTargets = { calorieTarget: 2000, proteinTarget: 140, stepTarget: 8000, trainingDays: [1, 3, 5], minMealSessions: 3 };

/** 21 complete days ending yesterday, oldest first; `shape` tweaks each. */
function days(shape: (date: string, wd: number, i: number) => Partial<DayRecord> = () => ({})): DayRecord[] {
  return Array.from({ length: 21 }, (_, k) => {
    const date = dateBack(21 - k);
    const wd = wdOf(date);
    return {
      date,
      weekday: wd,
      isTrainingDay: [1, 3, 5].includes(wd),
      mealSessions: 3,
      slots: ["breakfast", "lunch", "dinner"],
      calories: 1950,
      proteinG: 140,
      proteinBySlot: { breakfast: 30, lunch: 50, dinner: 60 },
      lastMealHour: 20,
      steps: 9000,
      workout: false,
      skipReason: null,
      score: { onTrack: true } as unknown as DayRecord["score"],
      ...shape(date, wd, k),
    };
  });
}

const gym: RoutineItem = { id: "g1", activityKey: "gym", label: "Gym", days: [1, 3, 5], startTime: "07:00", durationMin: 75, remindBeforeMin: null, checkAfterMin: 120, position: 0 };
const swim: RoutineItem = { id: "s1", activityKey: "swimming", label: "Swim", days: [2, 4], startTime: "07:00", durationMin: 60, remindBeforeMin: 30, checkAfterMin: 90, position: 1 };

function metric(p: Partial<MetricProgress> = {}): MetricProgress {
  return { metric: "weight_kg", label: "Weight", unit: "kg", start: 90, latest: 86, latestDate: dateBack(1), target: 80, progress: 0.4, requiredPerWeek: -0.5, actualPerWeek: -0.5, pace: "on_pace", projectedDate: "2027-01-20", ...p };
}
function goal(p: Partial<MetricProgress> = {}, g: Partial<GoalProgress["goal"]> = {}, extra: MetricProgress[] = []): GoalProgress {
  return { goal: { id: "goal1", startDate: "2026-09-01", deadline: "2027-02-01", targets: { weight_kg: 80 }, ...g }, weeksLeft: 13, daysLeft: 90, metrics: [metric(p), ...extra], checkinDue: false, lastCheckinDate: dateBack(3) };
}
function review(p: Partial<Extract<CalorieReview, { status: "ok" }>> = {}): CalorieReview {
  return {
    status: "ok", maintenanceKcal: 2600, avgIntakeKcal: 2000, loggedDays: 18, weighIns: 4, trendWeightKg: 86, actualKgPerWeek: -0.5, neededKgPerWeek: -0.5, plannedKgPerWeek: -0.5,
    suggestedTarget: 2000, currentTarget: 2000, change: 0, recommend: false, confidence: "high", cappedForSafety: false, safeDate: null, targetWeightKg: 80, deadline: "2027-02-01", summary: "",
    ...p,
  } as CalorieReview;
}

function input(p: Partial<DetectInput> = {}): DetectInput {
  return { today: TODAY, records: days(), targets, routine: [], routineChecks: [], gymChecks: [], sessions: [], goal: goal(), review: review(), floorKcal: 1700, bmrKcal: 1700, ...p };
}

/** Gym on Mon/Wed/Fri: each planned day gets the check `status(i)` (i counts planned days, oldest first). */
function gymChecks(status: (i: number) => [string, string | null]) {
  const planned = days().filter((r) => gym.days.includes(r.weekday));
  return planned.map((r, i) => ({ localDate: r.date, status: status(i)[0], reason: status(i)[1] }));
}

function ctx(p: Partial<OfferContext> = {}): OfferContext {
  return { today: TODAY, targets, review: review(), goal: goal(), originalDeadline: "2027-02-01", floorKcal: 1700, item: null, ...p };
}

function row(p: Partial<Intervention> = {}): Intervention {
  return {
    id: "i1", pattern: "routine_slipping", cause: "time", area: "routine:g1", itemId: "g1", itemLabel: "Gym", localDate: TODAY, title: "Gym isn't fitting your week", evidence: [], facts: {}, options: [],
    recommendation: null, status: "offered", chosenOption: null, before: null, applied: null, deferred: null, baseline: null, reviewOn: null, verdict: null, createdAt: `${TODAY}T10:00:00Z`, answeredAt: null, startedAt: null, closedAt: null,
    ...p,
  };
}

describe("detectors", () => {
  it("finds nothing in a good week", () => {
    const i = input({ routine: [gym], gymChecks: gymChecks(() => ["found", null]), records: days((_, wd) => ({ workout: [1, 3, 5].includes(wd) })) });
    expect(detectAll(i)).toEqual([]);
  });

  it("flags a routine item missed 3 of the last 5 times, and reads the reason", () => {
    const n = gymChecks(() => ["found", null]).length;
    const i = input({ routine: [gym], gymChecks: gymChecks((k) => (k >= n - 3 ? ["skipped", "work ran late"] : ["found", null])) });
    const f = detectRoutineSlipping(gym, i)!;
    expect(f.pattern).toBe("routine_slipping");
    expect(f.cause).toBe("time");
    expect(f.evidence[0]).toMatch(/2 of the last 5/);
    expect(f.evidence.join(" ")).toMatch(/work ran late/);
  });

  it("stays quiet while they're away or hurt", () => {
    const n = gymChecks(() => ["found", null]).length;
    const away = input({ routine: [gym], gymChecks: gymChecks((k) => (k >= n - 3 ? ["skipped", "travelling for a wedding"] : ["found", null])) });
    expect(detectRoutineSlipping(gym, away)).toBeNull();
    const hurt = input({ routine: [gym], gymChecks: gymChecks((k) => (k >= n - 3 ? ["skipped", "knee pain"] : ["found", null])) });
    expect(detectRoutineSlipping(gym, hurt)).toBeNull();
  });

  it("classifies skip reasons", () => {
    expect(classifyReason("meeting ran over")).toBe("time");
    expect(classifyReason("so tired today")).toBe("energy");
    expect(classifyReason("forgot")).toBe("forgot");
    expect(classifyReason("boring")).toBe("enjoyment");
    expect(classifyReason("fever")).toBe("away");
    expect(classifyReason("shoulder injury")).toBe("pain");
    expect(classifyReason(null)).toBeNull();
  });

  it("notices sessions done at another time and shorter", () => {
    const sessions = days().filter((r) => swim.days.includes(r.weekday)).map((r) => ({ key: "swimming", localDate: r.date, startHour: 18.5, durationMin: 35 }));
    const f = detectRoutineMismatch(swim, input({ routine: [swim], sessions }))!;
    expect(f.pattern).toBe("routine_mismatch");
    expect(f.facts.observedTime).toBe("18:30");
    expect(f.facts.observedMin).toBe(35);
  });

  it("flags calories over the band", () => {
    const f = detectIntake(input({ records: days((_, __, i) => ({ calories: i % 2 ? 2500 : 1950 })) }));
    expect(f[0]!.pattern).toBe("calories_over");
    expect(f[0]!.cause).toBe("target_strict");
  });

  it("flags calories under the band, and safety under the floor", () => {
    const under = detectIntake(input({ records: days(() => ({ calories: 1600 })), floorKcal: 1500 }));
    expect(under[0]!.pattern).toBe("calories_under");
    const unsafe = detectIntake(input({ records: days(() => ({ calories: 1300 })) }));
    expect(unsafe[0]!.pattern).toBe("safety");
    expect(unsafe[0]!.evidence[0]).toMatch(/1,700 kcal/);
  });

  it("reads low intake with flat weight as under-logging, not starving", () => {
    const f = detectIntake(input({ records: days(() => ({ calories: 1300 })), review: review({ actualKgPerWeek: 0 }) }));
    expect(f[0]!.pattern).toBe("calories_under");
    expect(f[0]!.cause).toBe("under_logging");
  });

  it("flags protein short and names the lightest meal", () => {
    const f = detectIntake(input({ records: days(() => ({ proteinG: 90, proteinBySlot: { breakfast: 10, lunch: 40, dinner: 40 } })) }));
    const p = f.find((x) => x.pattern === "protein_short")!;
    expect(p.facts.slot).toBe("breakfast");
  });

  it("spots a restrict-then-rebound pattern", () => {
    const f = detectRebound(input({ records: days((_, __, i) => ({ calories: i % 3 === 2 ? 2600 : 1300 })) }))!;
    expect(f.cause).toBe("early_restriction");
  });

  it("separates a stall from recomposition and under-logging", () => {
    const flat = { review: review({ actualKgPerWeek: 0, avgIntakeKcal: 1800 }), goal: goal({ actualPerWeek: 0 }) };
    expect(detectStalled(input({ ...flat, bmrKcal: 1700 }))!.cause).toBe("under_logging");
    const bf: MetricProgress = { ...metric(), metric: "body_fat_pct", label: "Body fat", unit: "%", latest: 22, target: 18, requiredPerWeek: -0.3, actualPerWeek: -0.3 };
    const recomp = detectStalled(input({ ...flat, goal: goal({ actualPerWeek: 0 }, {}, [bf]) }))!;
    expect(recomp.cause).toBe("recomp");
    expect(detectStalled(input())).toBeNull();
  });

  it("notices logging fading", () => {
    expect(detectLoggingFading(input({ records: days((_, __, i) => ({ mealSessions: i >= 16 && i % 2 === 0 ? 0 : 3 })) }))).not.toBeNull();
  });

  it("flags an over-ambitious pace and deadline drift", () => {
    const amb = detectOverAmbitious(input({ goal: goal({ requiredPerWeek: -1.2 }) }))!;
    expect(amb.pattern).toBe("over_ambitious");
    // The pace limit is the coach's guideline, never "your limit".
    expect(amb.evidence[0]).toContain("I suggest no more than 0.75% a week");
    expect(amb.evidence[0]).not.toMatch(/your (\d|limit)/i);
    expect(detectOverAmbitious(input())).toBeNull();
    expect(detectDeadlineDrift(input({ goal: goal({ pace: "behind", projectedDate: "2027-04-01", actualPerWeek: -0.3 }) }))!.facts.projectedDate).toBe("2027-04-01");
  });

  it("flags losing more than 1% a week", () => {
    expect(detectTooFast(input({ review: review({ actualKgPerWeek: -1.1 }) }))!.pattern).toBe("safety");
    expect(detectTooFast(input())).toBeNull();
  });

  it("holds everything but safety and pace in a goal's first week", () => {
    const records = days(() => ({ calories: 2600 }));
    const fresh = input({ records, goal: goal({}, { startDate: dateBack(2) }) });
    expect(detectAll(fresh).map((f) => f.pattern)).toEqual([]);
    expect(detectAll(input({ records })).map((f) => f.pattern)).toContain("calories_over");
  });
});

describe("options", () => {
  const slip: Finding = { pattern: "routine_slipping", cause: "time", area: "routine:g1", itemId: "g1", itemLabel: "Gym", weight: 4, evidence: ["Gym happened 2 of the last 5 planned times."], facts: { observedTime: "18:30" } };

  it("offers concrete routine changes that keep the goal date", () => {
    const o = buildOffer(slip, ctx({ item: gym }));
    expect(o.options.map((x) => x.id)).toEqual(["move_time", "shorter", "drop_day"]);
    expect(o.options[0]!.label).toBe("Move it to 18:30");
    expect(o.options.every((x) => x.impact.text === "Goal date stays 1 Feb 2027")).toBe(true);
    expect(o.recommendation).toBeNull();
  });

  it("computes when a calorie target reaches the goal", () => {
    // 6 kg to lose at (2,000 − 2,600)/7,700 kg a day ≈ 77 days.
    expect(dateForTarget(ctx(), 2000)).toBe("2027-01-19");
    expect(dateForTarget(ctx(), 2700)).toBe("never");
    expect(impactOf(ctx(), { targets: { calorieTarget: 2000 } }).kind).toBe("keeps");
    expect(impactOf(ctx(), { targets: { calorieTarget: 2400 } })).toMatchObject({ kind: "moves" });
  });

  it("recommends sticking to the plan when every easier option moves the date", () => {
    const over: Finding = { pattern: "calories_over", cause: "target_strict", area: "nutrition", itemId: null, itemLabel: null, weight: 4, evidence: [], facts: {} };
    // Tight: needs the full deficit to make the deadline.
    const tight = ctx({ goal: goal({}, { deadline: "2027-01-20" }), originalDeadline: "2027-01-20" });
    const o = buildOffer(over, tight);
    expect(o.options[0]!.kind).toBe("experiment");
    expect(o.options[0]!.impact.kind).toBe("keeps");
    // Without the keep-the-target option, every real option moves the date.
    const onlyMoves = buildOffer({ ...over, cause: "weekend" }, { ...tight, targets: { ...targets } });
    expect(onlyMoves.options.some((x) => x.impact.kind === "moves")).toBe(true);
  });

  it("sets the stick recommendation when all real options move the date", () => {
    const drift: Finding = { pattern: "deadline_drift", cause: "pace", area: "goal", itemId: null, itemLabel: null, weight: 4, evidence: [], facts: { projectedDate: "2027-04-01" } };
    const o = buildOffer(drift, ctx());
    expect(o.options[0]!.label).toBe("Move the goal to 1 Apr 2027");
    expect(o.recommendation).toMatch(/gets you there by 1 Feb 2027/);
    // "Talk it through" asks to fix the goal, matching the card; no milestone talk.
    const talk = o.options.find((x) => x.kind === "talk")!;
    expect(talk.prompt).toBe("Help me fix my goal.");
    expect(o.options.some((x) => /milestone/i.test(`${x.label} ${x.prompt ?? ""}`))).toBe(false);
  });

  it("caps extensions at six months past the original deadline and offers a rethink", () => {
    expect(capDate(ctx())).toBe("2027-08-02");
    const drift: Finding = { pattern: "deadline_drift", cause: "pace", area: "goal", itemId: null, itemLabel: null, weight: 4, evidence: [], facts: { projectedDate: "2027-12-01" } };
    const o = buildOffer(drift, ctx());
    expect(o.options.some((x) => x.id === "new_date")).toBe(false);
    expect(o.options.map((x) => x.kind)).toContain("talk");
  });

  it("never offers a target under the floor, and safety never says stick", () => {
    const safe: Finding = { pattern: "safety", cause: "target_low", area: "nutrition", itemId: null, itemLabel: null, weight: 100, evidence: [], facts: {} };
    const o = buildOffer(safe, ctx({ targets: { ...targets, calorieTarget: 1400 }, review: review({ maintenanceKcal: 2000 }) }));
    const raise = o.options.find((x) => x.id === "raise")!;
    expect(raise.change.targets!.calorieTarget).toBe(1700);
    expect(o.recommendation).toBeNull();
  });

  it("keeps judgement words off every card", () => {
    const findings: Finding[] = [
      slip,
      { ...slip, cause: "enjoyment" },
      { ...slip, cause: "forgot" },
      { ...slip, cause: "energy" },
      { pattern: "calories_over", cause: "heavy_meal", area: "nutrition", itemId: null, itemLabel: null, weight: 1, evidence: [], facts: {} },
      { pattern: "calories_under", cause: "undereating", area: "nutrition", itemId: null, itemLabel: null, weight: 1, evidence: [], facts: {} },
      { pattern: "rebound", cause: "early_restriction", area: "nutrition", itemId: null, itemLabel: null, weight: 1, evidence: [], facts: {} },
      { pattern: "logging_fading", cause: "logging_effort", area: "logging", itemId: null, itemLabel: null, weight: 1, evidence: [], facts: {} },
      { pattern: "stalled", cause: "steps_dropped", area: "goal", itemId: null, itemLabel: null, weight: 1, evidence: [], facts: { stepsBefore: 10000 } },
    ];
    for (const f of findings) {
      const o = buildOffer(f, ctx({ item: gym }));
      const text = [o.title, o.recommendation ?? "", ...o.options.flatMap((x) => [x.label, x.change.experiment ?? "", x.prompt ?? ""])].join(" ");
      expect(text).not.toMatch(BANNED);
      expect(o.options.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("selectFinding", () => {
  const f = (p: Partial<Finding>): Finding => ({ pattern: "routine_slipping", cause: "time", area: "routine:g1", itemId: "g1", itemLabel: "Gym", weight: 3, evidence: [], facts: {}, ...p });

  it("picks the heaviest finding", () => {
    expect(selectFinding([f({ weight: 2 }), f({ area: "nutrition", pattern: "calories_over", weight: 5 })], [], TODAY)!.area).toBe("nutrition");
  });
  it("posts at most one a day and two a week, except safety", () => {
    expect(selectFinding([f({})], [row({ area: "x", pattern: "rebound", localDate: TODAY })], TODAY)).toBeNull();
    const week = [row({ area: "a", localDate: dateBack(2), status: "kept" }), row({ area: "b", localDate: dateBack(4), status: "expired" })];
    expect(selectFinding([f({})], week, TODAY)).toBeNull();
    expect(selectFinding([f({ pattern: "safety", area: "nutrition" })], week, TODAY)).not.toBeNull();
  });
  it("keeps one open offer or trial per area, and stays quiet after keep", () => {
    expect(selectFinding([f({})], [row({ status: "trial", localDate: dateBack(10) })], TODAY)).toBeNull();
    expect(selectFinding([f({})], [row({ status: "kept", localDate: dateBack(15) })], TODAY)).toBeNull();
    expect(selectFinding([f({})], [row({ status: "kept", localDate: dateBack(22) })], TODAY)).not.toBeNull();
  });
});

describe("plan versions", () => {
  const live: PlanSnapshot = { goal: { targets: { weight_kg: 80 }, startDate: "2026-09-01", deadline: "2027-02-01" }, targets: { calorieTarget: 2000, proteinTarget: 140, stepTarget: 8000 }, routine: [gym] };

  it("applies a change and takes it back exactly", () => {
    const change = { routineItem: { itemId: "g1", patch: { startTime: "18:30", durationMin: 45 } }, targets: { calorieTarget: 2150 } };
    const before = beforeOf(live, change);
    expect(before).toEqual({ targets: { calorieTarget: 2000 }, routineItem: { itemId: "g1", patch: { startTime: "07:00", durationMin: 75 } } });
    const trial = withChange(live, change);
    expect(trial.routine[0]!.startTime).toBe("18:30");
    expect(withChange(trial, before)).toEqual(live);
  });

  it("shows the agreed plan with running trials taken out", () => {
    const change = { targets: { calorieTarget: 2150 } };
    const trialLive = withChange(live, change);
    const t = row({ status: "trial", before: beforeOf(live, change) });
    expect(agreedSnapshot(trialLive, [t])).toEqual(live);
    expect(agreedSnapshot(trialLive, [{ ...t, status: "confirmed" }])).toEqual(trialLive);
  });

  it("caps extensions against the goal's first deadline", () => {
    const v = (version: number, deadline: string): PlanVersion => ({ id: `v${version}`, version, snapshot: { ...live, goal: { ...live.goal!, deadline } }, reason: "", interventionId: null, createdAt: "" });
    expect(originalDeadline([v(2, "2027-03-01"), v(1, "2027-02-01")], { ...live.goal!, deadline: "2027-03-01" })).toBe("2027-02-01");
  });
});

describe("cards and context", () => {
  it("asks for the reason only when the cause is unknown", () => {
    expect(cardFromIntervention(row({ cause: "unknown" })).askReason).toBe(true);
    expect(cardFromIntervention(row()).askReason).toBe(false);
  });
  it("tells the coach what's running", () => {
    const t = row({ status: "trial", startedAt: `${dateBack(3)}T09:00:00Z`, reviewOn: "2026-11-10", chosenOption: "move_time", options: [{ id: "move_time", label: "Move it to 18:30", kind: "change", change: {}, impact: { kind: "keeps", date: null, text: "" } }] });
    expect(interventionsLine([t])).toMatch(/trial since 2026-10-31: "Move it to 18:30" for Gym, check on 2026-11-10/);
    expect(interventionsLine([row({ status: "kept" })])).toBeNull();
    expect(interventionNote(cardFromIntervention(t))).toMatch(/trial running, chose "Move it to 18:30"/);
  });
});

describe("engine helpers", () => {
  it("floors calories at the higher of 1,200 and BMR", () => {
    expect(calorieFloor({ sex: "male", birthYear: 1994, heightCm: 178 }, 86, TODAY)).toEqual({ floor: 1850, bmr: 1818 });
    expect(calorieFloor({ sex: "female", birthYear: 1990, heightCm: 150 }, 45, TODAY).floor).toBe(1200);
    expect(calorieFloor({ sex: null, birthYear: null, heightCm: null }, 80, TODAY)).toEqual({ floor: 1200, bmr: null });
  });
  it("measures a calorie trial as days inside the band", () => {
    const i = input({ records: days((_, __, k) => ({ calories: k % 2 ? 2500 : 1900 })) });
    const r = measure({ pattern: "calories_over", itemId: null, area: "nutrition" }, i, dateBack(14))!;
    expect(r).toBeCloseTo(0.5, 1);
  });
});

describe("root-cause evidence reuse", () => {
  const signals = [{ id: "late_dinner", check: "calories" as const, text: "Late dinners on 4 days", weight: 4 }];
  const past = (p: Partial<RcaReport>): RcaReport => ({ id: "r1", trigger: "weekly_review", periodStart: "", periodEnd: "", signals, hypothesis: "H", experiment: "E", targetCheck: "calories", baselineRate: null, status: "proposed", createdAt: dateBack(5) + "T10:00:00Z", startedAt: null, ...p });

  it("reuses a recent report with the same evidence instead of asking the model", () => {
    const now = new Date(`${TODAY}T10:00:00Z`);
    expect(reusableInsight(signals, [past({})], now)).toMatchObject({ hypothesis: "H", source: "reused" });
    expect(reusableInsight(signals, [past({ createdAt: dateBack(20) + "T10:00:00Z" })], now)).toBeNull();
    expect(reusableInsight([{ ...signals[0]!, text: "Late dinners on 5 days" }], [past({})], now)).toBeNull();
  });
  it("signs evidence independent of order", () => {
    const a = { id: "a", text: "x" }, b = { id: "b", text: "y" };
    expect(evidenceSignature([a, b])).toBe(evidenceSignature([b, a]));
  });
});
