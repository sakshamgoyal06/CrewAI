/**
 * The person's weekly routine: several activities, each on its own days, at its own time, for its
 * own length, e.g. a morning walk every day, the gym on Mon/Wed/Fri evenings and a swim on
 * Tuesdays. Pure logic only (input, defaults, training days, the day's done/pending status and
 * when reminders and follow-ups are due), so it is easy to test. Storage is in `routineStore.ts`.
 *
 * Rules:
 * - "gym" means lifting logged in Hevy; its follow-up is the existing Hevy workout check.
 * - Training days are the days with anything but a walk on them; walks are movement, not training.
 * - A planned non-gym activity is done when an activity of that kind is logged (or synced from
 *   Health Connect) for at least half the planned minutes, or when the person says it's done.
 *   Walks also count the phone's walk minutes for the day.
 */
import { z } from "zod";

import { localDateKey } from "../nutrition/localDate.js";
import { ACTIVITY_CATALOG, catalogEntry, matchActivity, MIN_LIFTING_DAYS, type Activity } from "./activities.js";
import { zonedInstant } from "./gymSlot.js";
import { DAY_MS } from "../util/time.js";

export const GYM_KEY = "gym";
export const MAX_ROUTINE_ITEMS = 12;
/** A logged session counts toward a planned one when it covers at least this share of its minutes. */
export const DONE_SHARE = 0.5;
/** A reminder is still worth sending until this long after the start. */
const REMINDER_GRACE_MS = 15 * 60_000;
/** A follow-up that comes due while the server is down still runs if it's at most this late. */
const MAX_LATE_MS = 12 * 3_600_000;
/** Items with no set time are followed up at this local time. */
export const UNTIMED_CHECK_AT = "21:00";

export type RoutineItem = {
  id: string;
  /** "gym" or an activity catalog key ("walking", "swimming", "football"...). */
  activityKey: string;
  label: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Local "HH:MM", or null when there's no fixed time. */
  startTime: string | null;
  durationMin: number;
  /** Minutes before the start to remind; null = no reminder. */
  remindBeforeMin: number | null;
  /** Minutes after the start to check it was done. */
  checkAfterMin: number;
  position: number;
};

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

export const routineItemInput = z.object({
  /** Kept when editing, so past follow-ups stay attached. */
  id: z.string().uuid().optional(),
  /** "gym", a catalog key, or their words ("swimming", "evening football"). */
  activity: z.string().trim().min(1).max(60),
  label: z.string().trim().max(40).optional().nullable(),
  days: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  startTime: HHMM.nullable().optional(),
  durationMin: z.coerce.number().int().min(5).max(600),
  remindBeforeMin: z.coerce.number().int().min(0).max(180).nullable().optional(),
  checkAfterMin: z.coerce.number().int().min(15).max(720).optional(),
});
export type RoutineItemInput = z.infer<typeof routineItemInput>;

export const routineInput = z.object({ items: z.array(routineItemInput).max(MAX_ROUTINE_ITEMS) });

export const isGym = (i: Pick<RoutineItem, "activityKey">): boolean => i.activityKey === GYM_KEY;
/** Walks are movement; everything else on the routine is a training session. */
export const isTraining = (i: Pick<RoutineItem, "activityKey">): boolean => i.activityKey !== "walking";

const GYM_WORDS = /\b(gym|lift\w*|weights?|weight ?training|strength|hevy|workout)\b/i;

/** "gym", a catalog key, or free text → the item's activity key. */
export function resolveActivityKey(activity: string): string {
  const a = activity.trim().toLowerCase();
  if (a === GYM_KEY || GYM_WORDS.test(a)) return GYM_KEY;
  if (ACTIVITY_CATALOG.some((c) => c.key === a)) return a;
  return matchActivity(a).key;
}

const NOUN: Record<string, string> = { gym: "gym", walking: "walk", running: "run", swimming: "swim", cycling: "ride", yoga: "yoga" };

/** The catalog's name for a key ("walking" → "Walking"), for logging the activity itself. */
export function catalogLabel(key: string): string {
  return key === GYM_KEY ? "Strength training" : catalogEntry(key).label;
}

/** "Morning walk", "Evening gym", "Football". */
export function defaultLabel(key: string, startTime: string | null, words?: string): string {
  const noun = NOUN[key];
  if (!noun) return key === "other" && words ? words.charAt(0).toUpperCase() + words.slice(1, 40) : catalogEntry(key).label;
  if (!startTime) return noun.charAt(0).toUpperCase() + noun.slice(1);
  const h = Number(startTime.slice(0, 2));
  const part = h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
  return `${part} ${noun}`;
}

/** Default follow-up delay: three hours for the gym (to allow for logging in Hevy), else an hour after it should end. */
export function defaultCheckAfter(key: string, durationMin: number): number {
  return key === GYM_KEY ? 180 : Math.min(720, Math.max(60, durationMin + 60));
}

/** Validated input → items as stored (ids are kept or left for the store to assign). */
export function normalizeRoutine(items: RoutineItemInput[]): Array<Omit<RoutineItem, "id"> & { id?: string }> {
  return items.map((i, position) => {
    const activityKey = resolveActivityKey(i.activity);
    const startTime = i.startTime ?? null;
    return {
      id: i.id,
      activityKey,
      label: i.label?.trim() || defaultLabel(activityKey, startTime, i.activity.trim()),
      days: [...new Set(i.days)].sort((a, b) => a - b),
      startTime,
      durationMin: i.durationMin,
      remindBeforeMin: startTime ? (i.remindBeforeMin === undefined ? (activityKey === GYM_KEY ? 30 : 15) : i.remindBeforeMin) : null,
      checkAfterMin: i.checkAfterMin ?? defaultCheckAfter(activityKey, i.durationMin),
      position,
    };
  });
}

/** Weekdays with a training session on them (anything but walks), sorted. */
export function trainingDaysOf(items: Array<Pick<RoutineItem, "activityKey" | "days">>): number[] {
  return [...new Set(items.filter(isTraining).flatMap((i) => i.days))].sort((a, b) => a - b);
}

/** Earliest gym start, for the legacy single gym slot. */
export function gymTimeOf(items: Array<Pick<RoutineItem, "activityKey" | "startTime">>): string | null {
  return items.filter(isGym).map((i) => i.startTime).filter((t): t is string => !!t).sort()[0] ?? null;
}

/** Gym days a week, and whether that's below the plan's strength minimum. */
export function liftingGap(items: Array<Pick<RoutineItem, "activityKey" | "days">>): { gymDays: number; need: number; short: boolean } {
  const gymDays = new Set(items.filter(isGym).flatMap((i) => i.days)).size;
  const need = Math.min(MIN_LIFTING_DAYS, trainingDaysOf(items).length);
  return { gymDays, need, short: gymDays < need };
}

/** The items planned on `weekday`, in time order (untimed last). */
export function itemsOn<T extends Pick<RoutineItem, "days" | "startTime" | "position">>(items: T[], weekday: number): T[] {
  return items
    .filter((i) => i.days.includes(weekday))
    .sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99") || a.position - b.position);
}

// ---------- the day's status ----------

export type RoutineCheckStatus = "done" | "missing" | "skipped";
export type RoutineCheck = { itemId: string; localDate: string; label: string; status: RoutineCheckStatus; reason: string | null; activityId: string | null };

export type ItemState = "done" | "skipped" | "pending";

export type RoutineItemStatus = {
  itemId: string;
  label: string;
  activityKey: string;
  startTime: string | null;
  durationMin: number;
  gym: boolean;
  state: ItemState;
  /** "Logged in Hevy", "Swimming · 40 min", "Skipped · work ran late", "6:30 pm". */
  detail: string;
};

export type DayEvidence = {
  /** Hevy workouts that day, plus one for "trained, didn't log it". */
  workouts: number;
  /** The gym check was answered "skipped", with the reason. */
  gymSkipped?: { reason: string | null } | null;
  /** A sport that stood in for the gym (activities.ts trainingActivity), if any. */
  sport?: Activity | null;
  /** Non-Hevy activities that day. */
  activities: Activity[];
  /** The phone's walk minutes for the day. */
  walkMinutes: number | null;
  /** Follow-up answers for that day, by item id. */
  checks: Map<string, RoutineCheck>;
};

const family = (k: string): string => (k === "indoor_cycling" ? "cycling" : k === "hiking" ? "walking" : k);

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/**
 * Done / skipped / pending for each item planned that day. Each logged session is used for at
 * most one item, so a single walk can't tick both the morning and the evening walk.
 */
export function routineDayStatus(items: RoutineItem[], weekday: number, ev: DayEvidence): RoutineItemStatus[] {
  const planned = itemsOn(items, weekday);
  const used = new Set<string>();
  for (const c of ev.checks.values()) if (c.activityId) used.add(c.activityId);
  let walkPool = ev.walkMinutes ?? 0;
  const out = new Map<string, RoutineItemStatus>();
  const base = (i: RoutineItem): Omit<RoutineItemStatus, "state" | "detail"> => ({
    itemId: i.id,
    label: i.label,
    activityKey: i.activityKey,
    startTime: i.startTime,
    durationMin: i.durationMin,
    gym: isGym(i),
  });
  const pendingDetail = (i: RoutineItem) => (i.startTime ? clock(i.startTime) : "any time");

  // Non-gym items first, so a planned swim claims the swim before the gym looks for a stand-in.
  for (const i of planned.filter((x) => !isGym(x))) {
    const check = ev.checks.get(i.id);
    if (check?.status === "done") {
      out.set(i.id, { ...base(i), state: "done", detail: "Done" });
      continue;
    }
    const need = i.durationMin * DONE_SHARE;
    const match = ev.activities.find(
      (a) => !used.has(a.id) && !a.duplicateOf && family(a.key) === family(i.activityKey) && a.durationMin >= need,
    );
    if (match) {
      used.add(match.id);
      out.set(i.id, { ...base(i), state: "done", detail: `${match.label} · ${match.durationMin} min` });
      continue;
    }
    if (i.activityKey === "walking" && walkPool >= need) {
      const mins = Math.min(walkPool, i.durationMin);
      walkPool -= i.durationMin;
      out.set(i.id, { ...base(i), state: "done", detail: `${Math.round(mins)} min walked` });
      continue;
    }
    if (check?.status === "skipped") {
      out.set(i.id, { ...base(i), state: "skipped", detail: check.reason ? `Skipped · ${check.reason}` : "Skipped" });
      continue;
    }
    out.set(i.id, { ...base(i), state: "pending", detail: pendingDetail(i) });
  }

  let workouts = ev.workouts;
  let sport = ev.sport && !used.has(ev.sport.id) ? ev.sport : null;
  for (const i of planned.filter(isGym)) {
    if (workouts > 0) {
      workouts -= 1;
      out.set(i.id, { ...base(i), state: "done", detail: "Logged in Hevy" });
    } else if (sport) {
      out.set(i.id, { ...base(i), state: "done", detail: `${sport.label} counted` });
      sport = null;
    } else if (ev.gymSkipped) {
      out.set(i.id, { ...base(i), state: "skipped", detail: ev.gymSkipped.reason ? `Skipped · ${ev.gymSkipped.reason}` : "Skipped" });
    } else {
      out.set(i.id, { ...base(i), state: "pending", detail: pendingDetail(i) });
    }
  }
  return planned.map((i) => out.get(i.id)!);
}

// ---------- reminders and follow-ups ----------

export type DueReminder = { item: RoutineItem; date: string; startsAt: Date };
export type DueFollowUp = { item: RoutineItem; date: string; dueAt: Date };

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/**
 * What's due at `now`: reminders (from `remindBeforeMin` before the start until shortly after it)
 * and follow-ups for non-gym items (from `checkAfterMin` after the start, today or yesterday,
 * at most 12 hours late). The gym's follow-up is the Hevy workout check.
 */
export function dueRoutineEvents(input: { items: RoutineItem[]; now: Date; timezone: string }): { reminders: DueReminder[]; followUps: DueFollowUp[] } {
  const { items, now, timezone } = input;
  const today = localDateKey(now, timezone);
  const yesterday = localDateKey(new Date(now.getTime() - DAY_MS), timezone);
  const t = now.getTime();
  const reminders: DueReminder[] = [];
  const followUps: DueFollowUp[] = [];
  for (const item of items) {
    if (item.startTime && item.remindBeforeMin !== null && item.days.includes(weekdayOf(today))) {
      const startsAt = zonedInstant(today, item.startTime, timezone);
      const from = startsAt.getTime() - item.remindBeforeMin * 60_000;
      if (t >= from && t < startsAt.getTime() + REMINDER_GRACE_MS) reminders.push({ item, date: today, startsAt });
    }
    if (isGym(item)) continue;
    for (const date of new Set([yesterday, today])) {
      if (!item.days.includes(weekdayOf(date))) continue;
      const dueAt = item.startTime
        ? new Date(zonedInstant(date, item.startTime, timezone).getTime() + item.checkAfterMin * 60_000)
        : zonedInstant(date, UNTIMED_CHECK_AT, timezone);
      const late = t - dueAt.getTime();
      if (late >= 0 && late <= MAX_LATE_MS) followUps.push({ item, date, dueAt });
    }
  }
  return { reminders, followUps };
}

export function reminderText(item: RoutineItem, now: Date, startsAt: Date): { title: string; body: string } {
  const mins = Math.round((startsAt.getTime() - now.getTime()) / 60_000);
  const when = mins > 1 ? `in ${mins} min` : "now";
  const length = `${item.durationMin} min`;
  if (isGym(item)) {
    return { title: `${item.label} ${when}`, body: `${clock(item.startTime!)} · ${length}. Log it in Hevy and I'll pick it up.` };
  }
  return { title: `${item.label} ${when}`, body: `${clock(item.startTime!)} · ${length}. I'll check it off when it shows up, or tell me when you're done.` };
}

export function followUpText(item: RoutineItem, date: string, today: string): string {
  const day = date === today ? "" : "yesterday ";
  const at = item.startTime ? ` (${day}${clock(item.startTime)})` : day ? " yesterday" : " today";
  return `No sign of your ${item.label.toLowerCase()}${at}. Did you get it in?`;
}

/** One line for the coach and the morning push: "Morning walk 7:00 am · Gym 6:30 pm". */
export function routineLine(items: Array<Pick<RoutineItem, "label" | "startTime">>): string {
  return items.map((i) => (i.startTime ? `${i.label} ${clock(i.startTime)}` : i.label)).join(" · ");
}
