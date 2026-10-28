/**
 * Pure helpers for growth / frontload context — activity-agnostic, multi-user safe.
 */
import type { RoutingGrowthContext } from "./types.js";

export type DayTone = "working" | "rest" | "relaxed" | "mixed" | "unknown";

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const REST_MARKERS = /\b(?:rest|off|recovery|light\s+day|easy\s+day|relaxed?)\b/i;
const WORK_MARKERS =
  /\b(?:work|deep|focus|meeting|gym|workout|train|study|project|office|shift|commitment|session)\b/i;
const RELAXED_INTENTION =
  /\b(?:relax|rest|light\s+day|easy\s+day|off\s+day|slow\s+day|no\s+pressure|take\s+it\s+easy)\b/i;
const WORKING_INTENTION =
  /\b(?:ship|finish|grind|focus|deep\s+work|productive|execute|deliver|gym|workout)\b/i;

export function computeShowUpRate(done: number, total: number): number | undefined {
  if (total <= 0) {
    return undefined;
  }
  return Math.round((done / total) * 100);
}

export function isLateEveningHour(hour: number, threshold = 21): boolean {
  return hour >= threshold;
}

export function isEventOverdue(input: {
  status: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  now: Date;
}): boolean {
  if (input.status !== "planned" && input.status !== "in_progress") {
    return false;
  }
  const due = input.plannedEndAt ?? input.plannedStartAt;
  return due ? new Date(due).getTime() < input.now.getTime() : false;
}

/** Infer rest vs working from weekly_schedule markdown for today's weekday. */
export function inferScheduleDayTone(scheduleBody: string, dayIndex: number): DayTone {
  const dayName = DAY_NAMES[dayIndex] ?? "mon";
  if (!scheduleBody.trim()) {
    return "unknown";
  }

  let sawRest = false;
  let sawWork = false;

  for (const line of scheduleBody.split("\n")) {
    const lower = line.toLowerCase();
    if (!lower.includes(dayName)) {
      continue;
    }
    if (REST_MARKERS.test(lower)) {
      sawRest = true;
    }
    if (WORK_MARKERS.test(lower) && !REST_MARKERS.test(lower)) {
      sawWork = true;
    }
  }

  if (sawRest && sawWork) {
    return "mixed";
  }
  if (sawRest) {
    return "rest";
  }
  if (sawWork) {
    return "working";
  }
  return "unknown";
}

export type InferDayFrameToneInput = {
  scheduleBody?: string;
  dayIndex: number;
  morningIntention?: string;
  energyLevel?: number;
  openCommitmentCount: number;
  overdueCount: number;
  dailyPlanIntention?: string;
};

/** Combine schedule, check-in, commitments, and plan into a day tone. */
export function inferDayFrameTone(input: InferDayFrameToneInput): {
  tone: DayTone;
  reason?: string;
} {
  const scheduleTone = inferScheduleDayTone(input.scheduleBody ?? "", input.dayIndex);
  const intention = input.morningIntention?.trim() ?? "";
  const plan = input.dailyPlanIntention?.trim() ?? "";

  if (RELAXED_INTENTION.test(intention) || RELAXED_INTENTION.test(plan)) {
    return { tone: "relaxed", reason: "morning intention or plan signals a light day" };
  }
  if (WORKING_INTENTION.test(intention) || WORKING_INTENTION.test(plan)) {
    return { tone: "working", reason: "morning intention or plan signals execution focus" };
  }
  if (input.energyLevel != null && input.energyLevel <= 3) {
    return { tone: "relaxed", reason: "low reported energy" };
  }
  if (input.overdueCount > 0 || input.openCommitmentCount >= 4) {
    return { tone: "working", reason: "heavy commitment load today" };
  }
  if (scheduleTone === "rest") {
    return { tone: "rest", reason: "weekly schedule marks today as rest" };
  }
  if (scheduleTone === "working") {
    return { tone: "working", reason: "weekly schedule marks today as active" };
  }
  if (input.openCommitmentCount >= 2) {
    return { tone: "working", reason: "multiple commitments planned today" };
  }
  if (input.openCommitmentCount === 0 && scheduleTone === "unknown") {
    return { tone: "relaxed", reason: "no open commitments and no schedule pressure" };
  }
  return { tone: scheduleTone === "mixed" ? "mixed" : "unknown" };
}

export type SlippingRoutineInput = {
  activityKey: string;
  activity: string;
  pillar?: string;
  recentMisses: number;
  showUpRate?: number;
  total?: number;
};

/** Merge recent missed events with activity_stats — generic, any activity_key. */
export function buildSlippingRoutines(input: {
  recentMissesByKey: Map<string, { activity: string; pillar?: string; misses: number }>;
  activityStats: RoutingGrowthContext["kpis"]["topRoutines"];
  minMisses?: number;
  maxShowUpRate?: number;
  limit?: number;
}): SlippingRoutineInput[] {
  const minMisses = input.minMisses ?? 2;
  const maxShowUpRate = input.maxShowUpRate ?? 65;
  const limit = input.limit ?? 4;

  const byKey = new Map<string, SlippingRoutineInput>();

  for (const [key, row] of input.recentMissesByKey) {
    if (row.misses >= minMisses) {
      byKey.set(key, {
        activityKey: key,
        activity: row.activity,
        pillar: row.pillar,
        recentMisses: row.misses,
      });
    }
  }

  for (const stat of input.activityStats) {
    const key = stat.activity;
    if (!key || stat.total < 3) {
      continue;
    }
    if (stat.showUpRate != null && stat.showUpRate > maxShowUpRate) {
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.showUpRate = stat.showUpRate;
      existing.total = stat.total;
      continue;
    }
    if (stat.missed >= minMisses || (stat.showUpRate != null && stat.showUpRate <= maxShowUpRate)) {
      byKey.set(key, {
        activityKey: key,
        activity: stat.activity,
        pillar: stat.pillar,
        recentMisses: stat.missed,
        showUpRate: stat.showUpRate,
        total: stat.total,
      });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => {
      const missDiff = b.recentMisses - a.recentMisses;
      if (missDiff !== 0) {
        return missDiff;
      }
      return (a.showUpRate ?? 100) - (b.showUpRate ?? 100);
    })
    .slice(0, limit);
}

export function routineConsistencyHint(
  slipping: SlippingRoutineInput[],
): string | undefined {
  const top = slipping[0];
  if (!top) {
    return undefined;
  }
  if (top.showUpRate != null && top.total != null && top.total >= 3) {
    return (
      `${top.activity} show-up ~${top.showUpRate}% (${top.recentMisses} recent miss(es)) — ` +
      "consistency is the lever."
    );
  }
  if (top.recentMisses >= 2) {
    return `${top.activity} missed or skipped ${top.recentMisses} times recently — protect recovery and show-up next.`;
  }
  return undefined;
}

export function projectConsistencyHint(
  projects: RoutingGrowthContext["projects"]["active"],
): string | undefined {
  const withOpen = projects.filter((p) => (p.openChecklistCount ?? 0) > 0);
  if (withOpen.length === 0) {
    return undefined;
  }
  const names = withOpen
    .slice(0, 2)
    .map((p) => p.title)
    .join(", ");
  return `${withOpen.length} active project(s) have open next steps${names ? ` (${names})` : ""}.`;
}

export function buildBehaviorNarrative(input: {
  issues: string[];
  wins: string[];
  dailyLogSnippets: Array<{ date: string; snippet: string }>;
  semanticFacts: string[];
  morningNotes?: string[];
}): string[] {
  const bullets: string[] = [];
  const max = 10;

  for (const issue of input.issues.slice(0, 3)) {
    bullets.push(`Issue: ${truncate(issue, 120)}`);
  }
  for (const win of input.wins.slice(0, 2)) {
    bullets.push(`Win: ${truncate(win, 120)}`);
  }
  for (const note of input.morningNotes ?? []) {
    bullets.push(`Morning: ${truncate(note, 140)}`);
  }
  for (const log of input.dailyLogSnippets.slice(0, 4)) {
    bullets.push(`${log.date}: ${truncate(log.snippet, 140)}`);
  }
  for (const fact of input.semanticFacts.slice(0, 3)) {
    if (!bullets.some((b) => b.includes(fact.slice(0, 40)))) {
      bullets.push(`Fact: ${truncate(fact, 120)}`);
    }
  }

  return bullets.slice(0, max);
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}

export function localWeekdayIndex(now: Date, timezone: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
    .format(now)
    .toLowerCase()
    .slice(0, 3);
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[short] ?? now.getUTCDay();
}
