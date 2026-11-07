/**
 * Routine adherence: a push reminder before each planned activity, and a follow-up after it. The
 * gym's follow-up is the Hevy workout check (workoutCheck.ts). For everything else, once the slot
 * has passed, the app looks for the activity (logged, or from Health Connect, or walk minutes) and,
 * when it isn't there, asks in chat: done (which logs it, so burn is right), skipped and why, or
 * something else instead. Each item/day is followed up once; reminders are deduped per item/day.
 */
import { z } from "zod";

import { localDateKey } from "../nutrition/localDate.js";
import type { ActionContext } from "./actions.js";
import { trainingActivity, typicalTrainingBurn, walkMinutesFromDay } from "./activities.js";
import { deleteActivity, FALLBACK_WEIGHT_KG, getActivities, latestWeightKg, saveActivity } from "./activityLog.js";
import { getActivityRange } from "./activityStore.js";
import { zonedInstant } from "./gymSlot.js";
import { getPrefs, nudgeChat, sendNotification } from "./push.js";
import {
  catalogLabel,
  defaultLabel,
  dueRoutineEvents,
  followUpText,
  isGym,
  liftingGap,
  normalizeRoutine,
  onDate,
  reminderText,
  resolveActivityKey,
  routineInput,
  routineDayStatus,
  type DayEvidence,
  type RoutineCheck,
  type RoutineItem,
  type RoutineItemStatus,
  type RoutineSwap,
} from "./routine.js";
import { postCheck } from "./coachInbox.js";
import { checkKey, checksOn, getRoutineChecks, insertRoutineCheck, saveRoutine, saveRoutineCheckAnswer, setRoutineSwap } from "./routineStore.js";
import { loadHealthProfile, loadRecentWorkouts, weekdayOfDate } from "./snapshot.js";
import { getWorkoutChecks, postCoachMessage } from "./workoutCheckStore.js";

export type RoutineCheckCard = {
  type: "routine_check";
  itemId: string;
  date: string;
  label: string;
  activityKey: string;
  startTime: string | null;
  durationMin: number;
  status: "missing" | "done" | "skipped";
  reason?: string | null;
  /** Posted with the reminder before the slot, not as the follow-up after it. */
  reminder?: boolean;
};

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const routineCheckAnswerInput = z.object({
  itemId: z.string().uuid(),
  date: DATE.optional(),
  /** undo clears an answer (back to not answered) and removes the activity a "done" logged. */
  answer: z.enum(["done", "skipped", "recheck", "undo"]),
  /** With done: minutes actually done, when different from the plan. */
  durationMin: z.coerce.number().int().min(1).max(600).optional(),
  reason: z.string().trim().max(300).optional(),
});

/** Done / skipped / pending for every routine item on `dates`, from the stored logs. */
export async function routineStatusFor(
  userProfileId: string,
  timezone: string,
  routine: RoutineItem[],
  dates: string[],
  opts: { withHevy?: boolean } = {},
): Promise<Map<string, RoutineItemStatus[]>> {
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;
  const needsGym = opts.withHevy !== false && routine.some(isGym);
  const [acts, daily, checks, workoutChecks, hevy, kg] = await Promise.all([
    getActivities(userProfileId, from, to),
    getActivityRange(userProfileId, from, to),
    getRoutineChecks(userProfileId, from, to),
    getWorkoutChecks(userProfileId, from, to),
    needsGym ? loadRecentWorkouts(userProfileId, timezone) : Promise.resolve(null),
    latestWeightKg(userProfileId),
  ]);
  const typical = typicalTrainingBurn((hevy?.workouts ?? []).map((w) => w.durationMin ?? 0), kg ?? FALLBACK_WEIGHT_KG);
  const out = new Map<string, RoutineItemStatus[]>();
  for (const date of dates) {
    const dayActs = acts.filter((a) => a.localDate === date);
    const wc = workoutChecks.get(date);
    const inHevy = (hevy?.workouts ?? []).filter((w) => w.localDate === date).length;
    const workouts = inHevy || (wc?.status === "trained_unlogged" || (wc?.status === "found" && !wc.reason) ? 1 : 0);
    const ev: DayEvidence = {
      workouts,
      gymSkipped: wc?.status === "skipped" ? { reason: wc.reason } : null,
      sport: workouts ? null : trainingActivity(dayActs, [], typical),
      activities: dayActs,
      walkMinutes: daily.get(date)?.walkMinutes ?? null,
      checks: checksOn(checks, date),
      date,
      timezone,
    };
    out.set(date, routineDayStatus(routine, weekdayOfDate(date), ev));
  }
  return out;
}

type Deps = {
  loadProfile: typeof loadHealthProfile;
  status: typeof routineStatusFor;
  insertCheck: typeof insertRoutineCheck;
  postMessage: typeof postCoachMessage;
  notify: typeof sendNotification;
  prefs: typeof getPrefs;
};

const defaultDeps: Deps = {
  loadProfile: (id) => loadHealthProfile(id),
  status: routineStatusFor,
  insertCheck: insertRoutineCheck,
  postMessage: (id, content, cards) => postCheck(id, content, cards[0] as RoutineCheckCard).then(() => undefined),
  notify: sendNotification,
  prefs: getPrefs,
};

/**
 * One pass: send due reminders and run due follow-ups. Reminders go out even in quiet hours,
 * because the person picked that time themselves; turning the kind off in Settings stops them.
 */
export async function runRoutineTick(
  userProfileId: string,
  now = new Date(),
  deps: Deps = defaultDeps,
): Promise<{ reminders: number; followUps: Array<{ itemId: string; date: string; status: "done" | "missing" }> }> {
  const profile = await deps.loadProfile(userProfileId);
  const routine = profile.routine ?? [];
  const result = { reminders: 0, followUps: [] as Array<{ itemId: string; date: string; status: "done" | "missing" }> };
  if (!routine.length) return result;
  const { reminders, followUps } = dueRoutineEvents({ items: routine, now, timezone: profile.timezone });
  if (!reminders.length && !followUps.length) return result;

  const dates = [...new Set([...reminders.map((r) => r.date), ...followUps.map((f) => f.date)])].sort();
  // Hevy is only needed to skip a gym reminder that's already done, which can't happen before the slot.
  const status = await deps.status(userProfileId, profile.timezone, routine, dates, { withHevy: false });
  const stateOf = (itemId: string, date: string) => status.get(date)?.find((s) => s.itemId === itemId)?.state ?? "pending";
  const prefs = await deps.prefs(userProfileId);
  const today = localDateKey(now, profile.timezone);

  for (const r of reminders) {
    if (prefs.off.includes("routine_reminder") || stateOf(r.item.id, r.date) !== "pending") continue;
    const text = reminderText(r.item, now, r.startsAt);
    // The chat gets the reminder too, with the routine card so it can be answered there once
    // it's done. A gym item has no card: its answer comes from Hevy (the workout check).
    const card: RoutineCheckCard | null = isGym(r.item)
      ? null
      : {
          type: "routine_check",
          itemId: r.item.id,
          date: r.date,
          label: r.item.label,
          activityKey: r.item.activityKey,
          startTime: r.item.startTime,
          durationMin: r.item.durationMin,
          status: "missing",
          reminder: true,
        };
    const sent = await deps.notify(userProfileId, {
      kind: "routine_reminder",
      dedupeKey: `routine_reminder:${r.item.id}:${r.date}`,
      title: text.title,
      body: text.body,
      url: "/app/#coach",
      chat: { ...nudgeChat(text), cards: card ? [card] : [] },
    });
    if (sent.sent) result.reminders += 1;
  }

  for (const f of followUps) {
    const state = stateOf(f.item.id, f.date);
    if (state === "skipped") continue;
    const done = state === "done";
    const inserted = await deps.insertCheck(userProfileId, {
      itemId: f.item.id,
      localDate: f.date,
      label: f.item.label,
      status: done ? "done" : "missing",
      reason: null,
      activityId: null,
    });
    if (!inserted) continue;
    result.followUps.push({ itemId: f.item.id, date: f.date, status: done ? "done" : "missing" });
    if (done) continue;
    const card: RoutineCheckCard = {
      type: "routine_check",
      itemId: f.item.id,
      date: f.date,
      label: f.item.label,
      activityKey: f.item.activityKey,
      startTime: f.item.startTime,
      durationMin: f.item.durationMin,
      status: "missing",
    };
    await deps.postMessage(userProfileId, followUpText(f.item, f.date, today), [card]);
    if (!prefs.off.includes("routine_check")) {
      await deps.notify(userProfileId, {
        kind: "routine_check",
        dedupeKey: `routine_check:${f.item.id}:${f.date}`,
        title: `${f.item.label}: done?`,
        body: "Nothing logged for it yet. Tap to answer.",
        url: "/app/#coach",
        chat: "posted",
      });
    }
  }
  return result;
}

/**
 * The person's reply: done (logs the activity at the planned time and length, or the minutes they
 * give), skipped (with why), or recheck (look at the logs again). Gym items are answered through
 * the Hevy workout check instead.
 */
export async function answerRoutineCheck(
  ctx: ActionContext,
  input: z.infer<typeof routineCheckAnswerInput>,
  deps: {
    loadProfile: typeof loadHealthProfile;
    status: typeof routineStatusFor;
    save: typeof saveRoutineCheckAnswer;
    logActivity: typeof saveActivity;
    /** The stored answer for the item and day (undo and skipped read the activity it logged). */
    current?: (userProfileId: string, itemId: string, date: string) => Promise<RoutineCheck | undefined>;
    removeActivity?: typeof deleteActivity;
    /** The phone's totals for the day (steps, walk minutes), to size a walk nobody timed. */
    dayTotals?: (userProfileId: string, date: string) => Promise<{ steps: number; walkMinutes: number | null } | undefined>;
  } = {
    loadProfile: (id) => loadHealthProfile(id),
    status: routineStatusFor,
    save: saveRoutineCheckAnswer,
    logActivity: saveActivity,
  },
): Promise<{ ok: true; status: "done" | "missing" | "skipped"; label: string } | { ok: false; error: string }> {
  const now = ctx.now ?? new Date();
  const today = localDateKey(now, ctx.timezone);
  const date = input.date ?? today;
  if (date > today) return { ok: false, error: "future_date" };
  const { routine } = await deps.loadProfile(ctx.userProfileId);
  const found = (routine ?? []).find((i) => i.id === input.itemId);
  if (!found) return { ok: false, error: "routine_item_not_found" };
  // A swapped gym day ("an evening walk instead") is answered like the walk it became.
  const item = onDate(found, date);
  if (isGym(item)) return { ok: false, error: "gym_uses_workout_check" };
  const base = { itemId: item.id, localDate: date, label: item.label };

  if (input.answer === "recheck") {
    const st = (await deps.status(ctx.userProfileId, ctx.timezone, [item], [date], { withHevy: false })).get(date)?.[0];
    if (st?.state !== "done") return { ok: true, status: "missing", label: item.label };
    const saved = await deps.save(ctx.userProfileId, { ...base, status: "done", reason: null, activityId: null });
    return saved.ok ? { ok: true, status: "done", label: item.label } : { ok: false, error: saved.error ?? "save_failed" };
  }

  // Undo, or a "done" changed to skipped: the activity that "done" logged comes out too.
  if (input.answer === "undo" || input.answer === "skipped") {
    const current = deps.current ?? (async (uid: string, itemId: string, d: string) => (await getRoutineChecks(uid, d, d)).get(checkKey(itemId, d)));
    const cur = await current(ctx.userProfileId, item.id, date);
    if (cur?.activityId) {
      const del = await (deps.removeActivity ?? deleteActivity)(ctx, cur.activityId);
      if (!del.ok && del.error !== "activity_not_found") return { ok: false, error: del.error ?? "undo_failed" };
    }
  }
  if (input.answer === "undo") {
    const saved = await deps.save(ctx.userProfileId, { ...base, status: "missing", reason: null, activityId: null });
    return saved.ok ? { ok: true, status: "missing", label: item.label } : { ok: false, error: saved.error ?? "save_failed" };
  }

  if (input.answer === "skipped") {
    const saved = await deps.save(ctx.userProfileId, { ...base, status: "skipped", reason: input.reason?.trim() || null, activityId: null });
    return saved.ok ? { ok: true, status: "skipped", label: item.label } : { ok: false, error: saved.error ?? "save_failed" };
  }

  // Done: log it, so the burn and the activity list match. The draft id makes a second tap a no-op.
  // A walk nobody timed is sized from the phone's steps instead of assuming the full planned time.
  let minutes = input.durationMin ?? item.durationMin;
  if (input.durationMin === undefined && item.activityKey === "walking") {
    const load = deps.dayTotals ?? (async (uid: string, d: string) => (await getActivityRange(uid, d, d)).get(d));
    minutes = walkMinutesFromDay(item.durationMin, await load(ctx.userProfileId, date).catch(() => undefined));
  }
  const logged = await deps.logActivity(ctx, {
    draftId: `routine:${item.id}:${date}`,
    date,
    startTime: item.startTime ? zonedInstant(date, item.startTime, ctx.timezone).toISOString() : null,
    durationMin: minutes,
    key: item.activityKey,
    label: catalogLabel(item.activityKey),
    intensity: "moderate",
    kcalSource: "estimate",
    source: "quick_add",
    // A changed answer ("it was 20 minutes, not 40") rewrites the activity it logged before.
    replace: input.durationMin !== undefined,
  });
  if (!logged.ok) return { ok: false, error: logged.error };
  const saved = await deps.save(ctx.userProfileId, { ...base, status: "done", reason: null, activityId: logged.activity.id });
  return saved.ok ? { ok: true, status: "done", label: item.label } : { ok: false, error: saved.error ?? "save_failed" };
}

/** Replaces the routine (from Settings, onboarding or chat) and returns it with the strength check. */
export async function setRoutine(
  ctx: ActionContext,
  input: z.infer<typeof routineInput>,
): Promise<{ ok: true; items: RoutineItem[]; trainingDays: number[]; lifting: ReturnType<typeof liftingGap> } | { ok: false; error: string }> {
  const saved = await saveRoutine(ctx.userProfileId, normalizeRoutine(input.items));
  if (!saved.ok) return saved;
  return { ...saved, lifting: liftingGap(saved.items) };
}

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const routineSwapInput = z.object({
  /** The item's id, its label ("Evening gym") or "gym". */
  item: z.string().trim().min(1).max(60),
  /** What they do instead ("walking", "home workout"); leave out to end a running swap. */
  activity: z.string().trim().min(1).max(60).optional(),
  durationMin: z.coerce.number().int().min(5).max(600).optional(),
  startTime: HHMM.nullable().optional(),
  /** Last local date of the swap. */
  until: DATE.optional(),
  reason: z.string().trim().max(80).optional(),
});

/** The routine item a person means: its id, its label, or "gym" for the (first) gym item. */
export function findRoutineItem(items: RoutineItem[], ref: string): RoutineItem | null {
  const r = ref.trim().toLowerCase();
  return (
    items.find((i) => i.id === ref) ??
    items.find((i) => i.label.toLowerCase() === r) ??
    (/\b(gym|lift|weights?|strength|workout)\b/.test(r) ? items.find(isGym) : undefined) ??
    items.find((i) => i.label.toLowerCase().includes(r) || i.activityKey === r) ??
    null
  );
}

/** The stand-in for an item from today to `until`. Pure. */
export function buildSwap(item: RoutineItem, input: z.infer<typeof routineSwapInput>, today: string): RoutineSwap | { error: string } {
  if (!input.activity) return { error: "activity_required" };
  if (!input.until || input.until < today) return { error: "until_required" };
  const activityKey = resolveActivityKey(input.activity);
  const startTime = input.startTime === undefined ? item.startTime : input.startTime;
  const durationMin = input.durationMin ?? (activityKey === "walking" ? 30 : Math.min(item.durationMin, 60));
  const label = `${defaultLabel(activityKey, startTime, input.activity)} (for ${item.label.toLowerCase()})`;
  return { activityKey, label, durationMin, startTime, from: today, until: input.until, reason: input.reason ?? null };
}

/**
 * "No gym till the 25th, I'll walk instead": that item becomes the stand-in until the date, with
 * its own reminder and check, and comes back on its own after. Without an activity, ends the swap.
 */
export async function swapRoutineItem(
  ctx: ActionContext,
  input: z.infer<typeof routineSwapInput>,
  deps: { loadProfile: typeof loadHealthProfile; save: typeof setRoutineSwap } = { loadProfile: (id) => loadHealthProfile(id), save: setRoutineSwap },
): Promise<{ ok: true; item: string; swap: RoutineSwap | null } | { ok: false; error: string; items?: string[] }> {
  const today = localDateKey(ctx.now ?? new Date(), ctx.timezone);
  const { routine } = await deps.loadProfile(ctx.userProfileId);
  const item = findRoutineItem(routine ?? [], input.item);
  if (!item) return { ok: false, error: "routine_item_not_found", items: (routine ?? []).map((i) => i.label) };
  if (!input.activity && !input.until) {
    const r = await deps.save(ctx.userProfileId, item.id, null);
    return r.ok ? { ok: true, item: item.label, swap: null } : r;
  }
  const swap = buildSwap(item, input, today);
  if ("error" in swap) return { ok: false, error: swap.error };
  const r = await deps.save(ctx.userProfileId, item.id, swap);
  return r.ok ? { ok: true, item: item.label, swap } : r;
}
