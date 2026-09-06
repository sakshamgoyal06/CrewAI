/**
 * Slim context payload for the Morning Brief — focus, plan, meals, reminders only.
 */
import { getLocalTimeParts } from "./morningBriefTime.js";
import type { MorningBriefContextBundle } from "./morningBriefContext.js";
import { offsetDateKey } from "../nutrition/parseMealPlanJson.js";

export type CompactCommitment = {
  title: string;
  time: string | null;
  status: string;
};

export type CompactReminder = {
  at: string;
  label: string;
};

export type CompactCalendarLine = {
  line: string;
};

export type CompactMorningBriefPayload = {
  date: string;
  timeZone: string;
  displayName: string | null;
  northStar: string | null;
  weekPriorities: string | null;
  hasMorningIntentionToday: boolean;
  weeklyGoals: string[];
  todayCommitments: CompactCommitment[];
  todayMeals: Array<{ slot: string; title: string }>;
  headsUp: string[];
  /** Google Calendar lines for today when connected (Step 6). */
  calendarToday: CompactCalendarLine[];
  /** Proactive reminders scheduled for today. */
  todayReminders: CompactReminder[];
};

function eventLocalDateKey(
  plannedStartAt: string | null | undefined,
  timeZone: string,
): string | null {
  if (!plannedStartAt?.trim()) {
    return null;
  }
  const at = new Date(plannedStartAt);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  return getLocalTimeParts(at, timeZone).dateKey;
}

function formatEventTime(plannedStartAt: string | null | undefined, timeZone: string): string | null {
  if (!plannedStartAt?.trim()) {
    return null;
  }
  const at = new Date(plannedStartAt);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

function goalTitle(row: unknown): string | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const title = (row as Record<string, unknown>).title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function goalTimeframe(row: unknown): string | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const tf = (row as Record<string, unknown>).timeframe;
  return typeof tf === "string" ? tf : null;
}

export function buildCompactMorningBriefPayload(
  bundle: MorningBriefContextBundle,
): CompactMorningBriefPayload {
  const now = new Date(bundle.nowIso);
  const local = getLocalTimeParts(now, bundle.timeZone);
  const todayKey = local.dateKey;
  const yesterdayKey = offsetDateKey(todayKey, -1);

  const weeklyGoals = bundle.goals
    .map((g) => {
      const tf = goalTimeframe(g);
      const title = goalTitle(g);
      if (!title) {
        return null;
      }
      if (tf === "weekly" || tf === "north_star") {
        return title;
      }
      return null;
    })
    .filter((t): t is string => Boolean(t))
    .slice(0, 3);

  const todayCommitments: CompactCommitment[] = [];
  const headsUp: string[] = [];

  for (const raw of bundle.events) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) {
      continue;
    }
    const status = typeof row.status === "string" ? row.status : "planned";
    const eventDay = eventLocalDateKey(
      typeof row.planned_start_at === "string" ? row.planned_start_at : null,
      bundle.timeZone,
    );

    if (eventDay === todayKey) {
      todayCommitments.push({
        title,
        time: formatEventTime(
          typeof row.planned_start_at === "string" ? row.planned_start_at : null,
          bundle.timeZone,
        ),
        status,
      });
    } else if (
      eventDay === yesterdayKey &&
      (status === "missed" || status === "skipped")
    ) {
      headsUp.push(`Yesterday missed: ${title}`);
    }
  }

  const todayMeals =
    bundle.nutritionBrief?.todayPlannedMeals
      ?.filter((m) => m.title?.trim())
      .map((m) => ({ slot: m.slot, title: m.title.trim() }))
      .slice(0, 6) ?? [];

  // Cap heads-up items; commitments list is the main plan view.
  const limitedHeadsUp = headsUp.slice(0, 2);

  const calendarToday =
    bundle.dayContext?.calendarText &&
    !bundle.dayContext.calendarText.startsWith("Nothing on Google Calendar")
      ? bundle.dayContext.calendarText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .slice(0, 8)
          .map((line) => ({ line }))
      : [];

  const todayReminders =
    bundle.dayContext?.reminders.slice(0, 6).map((r) => ({
      at: r.at,
      label: r.label,
    })) ?? [];

  return {
    date: todayKey,
    timeZone: bundle.timeZone,
    displayName: bundle.displayName ?? null,
    northStar: bundle.northStarGoal ?? null,
    weekPriorities: bundle.weekPriorities ?? null,
    hasMorningIntentionToday: bundle.hasMorningIntentionToday ?? false,
    weeklyGoals,
    todayCommitments: todayCommitments.slice(0, 8),
    todayMeals,
    headsUp: limitedHeadsUp,
    calendarToday,
    todayReminders,
  };
}
