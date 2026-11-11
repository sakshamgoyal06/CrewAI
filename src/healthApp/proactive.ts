/**
 * The proactive loop: every few minutes, in this process, run the gym-slot workout check, send
 * the day's nudges as push notifications, and start a root-cause analysis when the person has
 * been off track. Everything is deduped per day, so restarts and overlapping ticks are safe.
 */
import { logger } from "../logger.js";
import { localDateKey } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import { formatTime } from "./gymSlot.js";
import { getPrefs, isQuiet, sendNotification, type Notification, type NotificationPrefs } from "./push.js";
import { cardFromReport, listReports, rcaDue, reviewExperiments, runRca } from "./rca.js";
import { buildHealthSnapshot, loadHealthProfile, type HealthSnapshot } from "./snapshot.js";
import { ensureDayPlan, localDayRange } from "./dailyChat.js";
import { routineLine } from "./routine.js";
import { runRoutineTick } from "./routineCheck.js";
import { runInterventionTick } from "./interventions/engine.js";
import { runDayClose, runMealTimeTick } from "./dietPlan/rhythm.js";
import { runWorkoutChecks, SCHEDULER_INTERVAL_MS } from "./workoutCheck.js";
import { runNightlyDigest } from "./nightlyDigest.js";
import { LAPSE_AT, LAPSE_LAST_DAY, LAPSE_QUIET_FROM, lapseNudge } from "./lapse.js";
import { blankDaysSince, loadLastLogDate } from "./loggingStatus.js";
import { hasFeature } from "./billing.js";
import { isAccountDisabled } from "./accountStatus.js";
import { postCoachMessage } from "./workoutCheckStore.js";
import { DAY_MS, localClock, addDays } from "../util/time.js";
import { loadBreaks, planBreakOn, pauseEndMessage, type Break } from "./breaks.js";
import { stableTurnId } from "../util/stableId.js";

/** A nudge only fires within this long after its time, so a late restart doesn't send stale ones. */
const NUDGE_WINDOW_MIN = 90;
const STEPS_PER_MIN = 110;
/** Phone steps older than this don't trigger the step nudge. */
const STEP_SYNC_FRESH_MS = 2 * 60 * 60 * 1000;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** Their meal plan's meals and times (plan setup), for meal reminders. */
export type MealPlanTimes = { meals: Array<{ slot: string; time: string | null }>; planPushOn: boolean };

const SLOT_LABELS: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
const DEFAULT_REMINDERS: Array<{ slot: string; time: string }> = [
  { slot: "breakfast", time: "10:30" },
  { slot: "lunch", time: "14:30" },
  { slot: "dinner", time: "21:15" },
];
/** A planned meal not logged this long after its time gets a reminder. */
const AFTER_PLANNED_MIN = 120;

/**
 * When to remind about an unlogged meal. Without a plan: fixed times for the three main meals.
 * With one: only the meals they plan, two hours after each meal's time, and none at all while
 * the plan's own meal-time push is on (that card already asked; a second push is a repeat).
 */
export function mealReminderTimes(plan: MealPlanTimes | null): Array<{ slot: string; time: string; label: string }> {
  const label = (slot: string) => SLOT_LABELS[slot] ?? slot;
  if (!plan) return DEFAULT_REMINDERS.map((r) => ({ ...r, label: label(r.slot) }));
  if (plan.planPushOn) return [];
  return plan.meals.flatMap((m) => {
    const base = m.time ?? DEFAULT_REMINDERS.find((d) => d.slot === m.slot)?.time;
    if (!base) return [];
    const t = Math.min(at(base) + AFTER_PLANNED_MIN, 23 * 60 + 30);
    return [{ slot: m.slot, time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, label: label(m.slot) }];
  });
}

/**
 * The nudges due at `now`, given today's snapshot. Pure. Each has a per-day dedupe key; the
 * sender drops any already sent.
 */
/**
 * Meal cards from today's chat still waiting for Confirm & log (their text), so the evening wrap
 * can remind once before they close at 05:00 (11 Nov: 9 drafts were never confirmed).
 */
export type PendingDrafts = string[];

export function dueNudges(s: HealthSnapshot, now: Date, prefs: NotificationPrefs, plan: MealPlanTimes | null = null, pending: PendingDrafts = []): Notification[] {
  const { hhmm, minutes } = localClock(now, s.timezone);
  if (isQuiet(hhmm, prefs)) return [];
  const date = s.today.date;
  const inWindow = (time: string) => minutes >= at(time) && minutes < at(time) + NUDGE_WINDOW_MIN;
  const out: Notification[] = [];
  const check = (id: string) => s.today.checks.find((c) => c.id === id);

  if (inWindow("08:00")) {
    const planned = s.today.routine ?? [];
    const parts = [
      planned.length
        ? `Today: ${routineLine(planned)}.`
        : s.today.isTrainingDay ? (s.gym.time ? `Training day: gym at ${formatTime(s.gym.time)}.` : "Training day.") : "Rest day.",
      [
        s.targets.calorieTarget ? `${fmt(s.targets.calorieTarget)} kcal` : null,
        s.targets.proteinTarget ? `${s.targets.proteinTarget} g protein` : null,
        `${fmt(s.targets.stepTarget)} steps`,
      ]
        .filter(Boolean)
        .join(" · ") + ".",
      // A long gap in logging makes "0/7" true but useless; leave it out until they're back.
      (s.logging?.blankDays ?? 0) >= 4 ? null : `Week so far: ${s.northStar.onTrackDays}/7 on track.`,
    ].filter(Boolean);
    out.push({ kind: "morning_plan", dedupeKey: `morning_plan:${date}`, title: "Today's plan", body: parts.join(" "), url: "/app/#coach" });
  }

  if (s.goal?.checkinDue && inWindow("08:30")) {
    out.push({ kind: "weigh_in", dedupeKey: `weigh_in:${date}`, title: "Weekly weigh-in", body: "Step on the scale before breakfast and log it, so the goal pace stays honest.", url: "/app/#tracker" });
  }

  const logged = new Set(s.meals.map((m) => m.slot));
  const blankDays = s.logging?.blankDays ?? 0;
  const nothingToday = s.meals.length === 0 && !(s.mealList?.done ?? 0);
  if (blankDays >= 2) {
    // Away from logging: one calm message on set days instead of a reminder per meal (lapse.ts).
    const n = inWindow(LAPSE_AT) ? lapseNudge(s, blankDays, date) : null;
    if (n) out.push(n);
  } else {
    const reminders = mealReminderTimes(plan);
    for (const [i, r] of reminders.entries()) {
      if (logged.has(r.slot) || !inWindow(r.time)) continue;
      // Nothing at all logged today: after the first reminder, one catch-up instead of one per meal.
      if (nothingToday && i > 0) {
        out.push({ kind: "meal_reminder", dedupeKey: `meal_catchup:${date}`, title: "Nothing logged yet today", body: "One line for the whole day is enough, or tap Ate this on the meals you had from the plan.", url: "/app/#coach" });
        continue;
      }
      out.push({ kind: "meal_reminder", dedupeKey: `meal_reminder:${r.slot}:${date}`, title: `${r.label} not logged`, body: "Tell me what you had in a line and I'll estimate it.", url: "/app/#coach" });
    }
  }

  const steps = check("steps");
  // With Health Connect, a count that hasn't synced in 2 hours is behind the phone, not the person.
  const syncedAt = s.today.phoneSyncedAt ? Date.parse(s.today.phoneSyncedAt) : NaN;
  const stepsStale = s.today.stepsFromPhone && !(now.getTime() - syncedAt <= STEP_SYNC_FRESH_MS);
  if (steps && !steps.met && !stepsStale && inWindow("17:00") && s.today.steps < s.targets.stepTarget * 0.6) {
    const gap = s.targets.stepTarget - s.today.steps;
    out.push({
      kind: "step_pace",
      dedupeKey: `step_pace:${date}`,
      title: "Steps are behind",
      body: `${fmt(s.today.steps)} of ${fmt(s.targets.stepTarget)}. A ${Math.ceil(gap / STEPS_PER_MIN / 5) * 5}-minute walk closes it.`,
      url: "/app/#tracker",
    });
  }

  if (inWindow("21:30")) {
    const open = s.today.checks.filter((c) => !c.met);
    // Unconfirmed meal cards first: they're the one thing that's lost if nobody taps.
    if (pending.length) {
      const what = pending.slice(0, 2).map((t) => `"${t.length > 40 ? `${t.slice(0, 38)}…` : t}"`).join(" and ");
      out.push({
        kind: "evening_wrap",
        dedupeKey: `evening_wrap:${date}`,
        title: pending.length === 1 ? "A meal isn't logged yet" : `${pending.length} meals aren't logged yet`,
        body: `${what}${pending.length > 2 ? ` and ${pending.length - 2} more` : ""} ${pending.length === 1 ? "is" : "are"} waiting in chat. Tap Confirm & log, or ${pending.length === 1 ? "it closes" : "they close"} unlogged overnight.`,
        url: "/app/#coach",
      });
    } else {
      out.push({
        kind: "evening_wrap",
        dedupeKey: `evening_wrap:${date}`,
        title: s.today.onTrack ? "On track today" : s.today.unlogged ? "Food not logged today" : "Still open today",
        body: s.today.onTrack
          ? `Every check is done. ${s.northStar.onTrackDays}/7 this week.`
          : s.today.unlogged
            // Not a list of zeros: the one thing missing is the log itself.
            ? ((rest) => `Nothing's logged yet. Tell me roughly what you ate, one line is enough.${rest.length ? ` Also open: ${rest.join(", ")}.` : ""}`)(
                open.filter((c) => c.id !== "meals_logged").map((c) => `${c.label} (${c.detail})`),
              )
            : `${open.map((c) => `${c.label} (${c.detail})`).join(", ")}.`,
        url: "/app/#tracker",
      });
    }
  }

  return out.filter((n) => !prefs.off.includes(n.kind));
}

/** The plan setup's meals and times; null when they have no meal plan set up. */
async function loadMealPlanTimes(userProfileId: string): Promise<Omit<MealPlanTimes, "planPushOn"> | null> {
  const { data } = await supabase.from("health_diet_preferences").select("prefs").eq("user_profile_id", userProfileId).maybeSingle();
  const meals = (data?.prefs as { meals?: Array<{ slot?: unknown; time?: unknown }> } | null)?.meals;
  if (!Array.isArray(meals) || !meals.length) return null;
  return { meals: meals.filter((m) => typeof m.slot === "string").map((m) => ({ slot: String(m.slot), time: typeof m.time === "string" ? m.time : null })) };
}

/** Today's chat meal cards with nothing logged from them, and no other log in their meal. */
export async function loadPendingDrafts(userProfileId: string, date: string, timezone: string): Promise<PendingDrafts> {
  const range = localDayRange(date, timezone);
  const { data } = await supabase
    .from("health_chat_messages")
    .select("cards")
    .eq("user_profile_id", userProfileId)
    .eq("role", "assistant")
    .gte("created_at", range.from)
    .lt("created_at", range.to);
  const drafts = ((data ?? []) as Array<{ cards?: Array<{ type?: string; draft?: { draftId?: string; text?: string; slot?: string; date?: string } }> }>)
    .flatMap((m) => m.cards ?? [])
    .filter((c) => c.type === "meal_draft" && c.draft?.draftId && (c.draft.date ?? date) === date)
    .map((c) => c.draft!);
  if (!drafts.length) return [];
  const { data: logs } = await supabase.from("meal_logs").select("meal_session_id, meal_slot").eq("user_profile_id", userProfileId).eq("local_date", date);
  const rows = (logs ?? []) as Array<{ meal_session_id: string | null; meal_slot: string | null }>;
  const sessions = new Set(rows.map((r) => r.meal_session_id));
  const slots = new Set(rows.map((r) => r.meal_slot));
  return drafts.filter((d) => !sessions.has(d.draftId!) && !slots.has(d.slot ?? "")).map((d) => d.text ?? "a meal");
}

async function runNudges(userProfileId: string, now: Date, only?: ReadonlySet<Notification["kind"]>): Promise<number> {
  const [snapshot, prefs, plan] = await Promise.all([buildHealthSnapshot(userProfileId, now), getPrefs(userProfileId), loadMealPlanTimes(userProfileId)]);
  // Only read at the evening wrap, the one time the reminder can go out.
  const { minutes } = localClock(now, snapshot.timezone);
  const pending = minutes >= 21 * 60 + 30 && minutes < 23 * 60
    ? await loadPendingDrafts(userProfileId, snapshot.today.date, snapshot.timezone).catch(() => [] as PendingDrafts)
    : [];
  let sent = 0;
  for (const n of dueNudges(snapshot, now, prefs, plan ? { ...plan, planPushOn: !prefs.off.includes("plan_meal") } : null, pending)) {
    if (only && !only.has(n.kind)) continue;
    if ((await sendNotification(userProfileId, n)).sent) sent += 1;
  }
  return sent;
}

async function runWorkoutCheckWithPush(userProfileId: string, now: Date): Promise<void> {
  const results = await runWorkoutChecks(userProfileId, now);
  if (results.length) logger.info({ results }, "workout check ran");
  const prefs = await getPrefs(userProfileId);
  for (const r of results.filter((x) => x.status === "missing")) {
    if (prefs.off.includes("workout_check")) break;
    await sendNotification(userProfileId, {
      kind: "workout_check",
      dedupeKey: `workout_check:${r.date}`,
      title: "Did you train?",
      body: "No workout in Hevy after your gym slot. Tap to answer.",
      url: "/app/#coach",
    });
  }
}

async function runRoutineWithLog(userProfileId: string, now: Date): Promise<void> {
  const r = await runRoutineTick(userProfileId, now);
  if (r.reminders || r.followUps.length) logger.info({ ...r }, "routine tick ran");
}

async function maybeRunRca(userProfileId: string, now: Date): Promise<void> {
  if (!(await hasFeature(userProfileId, "rca", now))) return;
  const snapshot = await buildHealthSnapshot(userProfileId, now);
  const days = snapshot.northStar.days;
  const lastTwo = days.slice(-3, -1);
  const reports = await listReports(userProfileId, 10);
  const newest = (t: string) => {
    const r = reports.find((x) => x.trigger === t);
    return r ? new Date(r.createdAt) : null;
  };
  const { minutes, weekday } = localClock(now, snapshot.timezone);
  const trigger = rcaDue({
    localDate: localDateKey(now, snapshot.timezone),
    localHour: minutes / 60,
    weekday,
    // Days that weren't logged (or only partly) say nothing about why: the morning brief and the
    // lapse ladder handle them, and no analysis (a model call) runs on missing data.
    lastTwoDaysOffTrack: lastTwo.length === 2 && lastTwo.every((d) => !d.onTrack && !d.unlogged && !d.partial),
    lastStreakReportAt: newest("off_track_streak"),
    lastWeeklyReportAt: newest("weekly_review"),
    now,
  });
  if (!trigger) return;

  const verdicts = trigger === "weekly_review" ? await reviewExperiments(userProfileId, now) : [];
  const result = await runRca(userProfileId, trigger, now);
  if (!result && !verdicts.length) return;
  const intro =
    trigger === "weekly_review"
      ? `Weekly review: ${snapshot.northStar.onTrackDays}/7 days on track.`
      : "Two days off track in a row, so I looked for the pattern.";
  // The card already leads with the hypothesis, so the message itself doesn't repeat it.
  const text = [intro, ...verdicts].join(" ");
  await postCoachMessage(userProfileId, text, result ? [cardFromReport(result.report)] : []);
  const prefs = await getPrefs(userProfileId);
  if (!prefs.off.includes("rca")) {
    await sendNotification(userProfileId, {
      kind: "rca",
      dedupeKey: `rca:${trigger}:${localDateKey(now, snapshot.timezone)}`,
      title: trigger === "weekly_review" ? "Your weekly review" : "Why the last two days slipped",
      body: result ? result.report.hypothesis : verdicts[0]!,
      url: "/app/#coach",
    });
  }
}

/** Finished days in a row with nothing logged, ending yesterday; null when they never logged. */
async function blankDaysFor(userProfileId: string, now: Date, breaks: Break[]): Promise<number | null> {
  const { timezone } = await loadHealthProfile(userProfileId);
  const today = localDateKey(now, timezone);
  const last = await loadLastLogDate(userProfileId, today);
  if (!last) return null;
  // Paused days don't count towards a lapse (breaks.ts).
  return blankDaysSince(last, today, (d) => !!planBreakOn(breaks, d));
}

/**
 * Two weeks or more without a log: daily coaching has stopped, and only the lapse ladder's
 * check-ins go out (every 3 days to day 30, weekly to day 60). Also runs for people who no
 * longer open the app, so the last word isn't silence.
 */
export async function lapseOnlyTick(userProfileId: string, now = new Date()): Promise<boolean> {
  if (await isAccountDisabled(userProfileId)) return false;
  const [s, prefs] = await Promise.all([buildHealthSnapshot(userProfileId, now), getPrefs(userProfileId)]);
  // A paused plan gets no lapse check-ins (breaks.ts): they told us they're away.
  if (planBreakOn(s.breaks ?? [], s.today.date)) return false;
  const blank = s.logging?.blankDays ?? 0;
  if (blank > LAPSE_LAST_DAY) return false;
  const { hhmm, minutes } = localClock(now, s.timezone);
  if (isQuiet(hhmm, prefs) || prefs.off.includes("logging_nudge")) return false;
  const [h, m] = LAPSE_AT.split(":").map(Number) as [number, number];
  if (minutes < h * 60 + m || minutes >= h * 60 + m + NUDGE_WINDOW_MIN) return false;
  const n = lapseNudge(s, blank, s.today.date);
  return n ? (await sendNotification(userProfileId, n)).sent : false;
}

/** The evening before a pause ends (from 18:00): one message and push to plan the way back. */
export const PAUSE_END_FROM_MIN = 18 * 60;

async function maybePauseEnd(userProfileId: string, now: Date, timezone: string, breaks: Break[]): Promise<void> {
  const today = localDateKey(now, timezone);
  const { minutes, hhmm } = localClock(now, timezone);
  if (minutes < PAUSE_END_FROM_MIN) return;
  const ending = breaks.filter((b) => b.endDate === today && !b.endedAt);
  if (!ending.length) return;
  const routine = (await loadHealthProfile(userProfileId)).routine ?? [];
  for (const b of ending) {
    const turnId = stableTurnId(`magnus-break-end:${b.id}`);
    const label = b.itemId ? routine.find((i) => i.id === b.itemId)?.label ?? null : null;
    const msg = pauseEndMessage(b, label, addDays(today, 1));
    const { error } = await supabase
      .from("health_chat_messages")
      .insert({ user_profile_id: userProfileId, role: "assistant", content: msg.text, cards: msg.card ? [msg.card] : [], turn_id: turnId, status: "ok" });
    if (error) continue; // 23505: already posted
    const prefs = await getPrefs(userProfileId);
    if (!isQuiet(hhmm, prefs)) await sendNotification(userProfileId, { kind: "pause_end", dedupeKey: `pause_end:${b.id}`, title: msg.title, body: msg.text, url: msg.url });
  }
}

/** One pass of everything proactive. Each part fails on its own without stopping the others. */
export async function proactiveTick(userProfileId: string, now = new Date()): Promise<void> {
  // A paused account gets no pushes, digests or analyses (and costs nothing) until it's re-enabled.
  if (await isAccountDisabled(userProfileId)) return;
  // A paused plan (breaks.ts): only the weekly weigh-in and the end-of-pause message (Saksham, 11 Nov).
  const { timezone } = await loadHealthProfile(userProfileId);
  const today = localDateKey(now, timezone);
  const breaks = await loadBreaks(userProfileId, today).catch(() => [] as Break[]);
  try {
    await maybePauseEnd(userProfileId, now, timezone, breaks);
  } catch (err) {
    logger.warn({ err: loggableError(err), part: "pause end" }, "proactive tick part failed");
  }
  if (planBreakOn(breaks, today)) {
    await runNudges(userProfileId, now, new Set(["weigh_in"])).catch((err) => logger.warn({ err: loggableError(err), part: "nudges" }, "proactive tick part failed"));
    return;
  }
  // Two weeks without a log: no day plans, checks or reminders any more, just the lapse check-ins.
  const blank = await blankDaysFor(userProfileId, now, breaks).catch(() => null);
  if (blank !== null && blank >= LAPSE_QUIET_FROM) {
    await lapseOnlyTick(userProfileId, now).catch((err) => logger.warn({ err: loggableError(err) }, "lapse tick failed"));
    return;
  }
  for (const [name, fn] of [
    // First, so the day's thread opens with the plan before any check lands in it.
    ["day plan", () => loadHealthProfile(userProfileId).then(({ timezone }) => ensureDayPlan(userProfileId, timezone, now)).then(() => undefined)],
    ["workout check", () => runWorkoutCheckWithPush(userProfileId, now)],
    ["routine", () => runRoutineWithLog(userProfileId, now)],
    // Before the nudges: a posted digest takes the evening push's dedupe key.
    ["digest", () => runNightlyDigest(userProfileId, now).then(() => undefined)],
    ["nudges", () => runNudges(userProfileId, now)],
    ["rca", () => maybeRunRca(userProfileId, now)],
    ["interventions", () => runInterventionTick(userProfileId, now).then(() => undefined)],
    ["meal plan", () => loadHealthProfile(userProfileId).then(({ timezone }) => runMealTimeTick({ userProfileId, timezone, now }, now)).then(() => undefined)],
    ["day close", () => loadHealthProfile(userProfileId).then(({ timezone }) => runDayClose({ userProfileId, timezone, now }, now)).then(() => undefined)],
  ] as const) {
    try {
      await fn();
    } catch (err) {
      logger.warn({ err: loggableError(err), part: name }, "proactive tick part failed");
    }
  }
}

/**
 * People who used the app in the last two weeks; the proactive loop only runs for them. "Used"
 * means they wrote to the coach or called the API themselves. The coach's own messages don't
 * count, or a nudge would keep someone "active" forever.
 */
const ACTIVE_DAYS = 14;
const ACTIVE_REFRESH_MS = 15 * 60_000;
const ACTIVE_ROWS = 5_000;

export async function listActiveUsers(now = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - ACTIVE_DAYS * DAY_MS).toISOString();
  const [chat, events] = await Promise.all([
    supabase
      .from("health_chat_messages")
      .select("user_profile_id")
      .eq("role", "user")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ACTIVE_ROWS),
    supabase
      .from("health_app_events")
      .select("user_profile_id")
      .eq("kind", "server_route")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(ACTIVE_ROWS),
  ]);
  if (chat.error) throw new Error(`active users: ${chat.error.message}`);
  if (events.error) throw new Error(`active users: ${events.error.message}`);
  return [...new Set([...(chat.data ?? []), ...(events.data ?? [])].map((r) => String(r.user_profile_id)))];
}

/**
 * People who logged a meal in the last 60 days but no longer use the app (not in the active
 * list): they only get the lapse ladder's check-ins (lapseOnlyTick).
 */
export async function listLapsedUsers(active: string[], now = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - (LAPSE_LAST_DAY + 2) * DAY_MS).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("meal_logs")
    .select("user_profile_id")
    .is("deleted_at", null)
    .gte("local_date", since)
    .order("local_date", { ascending: false })
    .limit(ACTIVE_ROWS);
  if (error) throw new Error(`lapsed users: ${error.message}`);
  const skip = new Set(active);
  return [...new Set((data ?? []).map((r) => String(r.user_profile_id)))].filter((id) => !skip.has(id));
}

/** Lapsed people are checked at most this often: their one message a day goes out in a 90-minute window. */
const LAPSED_EVERY_MS = 30 * 60_000;

/** Users ticked at the same time: enough to keep a slow Hevy call from holding up everyone. */
const TICK_CONCURRENCY = 4;

async function forEachLimited(ids: string[], limit: number, fn: (id: string) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < ids.length) await fn(ids[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
}

/**
 * Runs `proactiveTick` for every active user (plus `alwaysInclude`, the deploy owner) on an
 * interval, a few users at a time. A tick never starts while the last one is still running.
 */
export function startProactiveScheduler(
  alwaysInclude: string[] = [],
  intervalMs = SCHEDULER_INTERVAL_MS,
  loadUsers: () => Promise<string[]> = () => listActiveUsers(),
  loadLapsed: (active: string[]) => Promise<string[]> = (active) => listLapsedUsers(active),
): () => void {
  let running = false;
  let users: string[] = [...alwaysInclude];
  let lapsed: string[] = [];
  let usersAt = 0;
  let lapsedAt = 0;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      if (Date.now() - usersAt > ACTIVE_REFRESH_MS) {
        try {
          users = [...new Set([...alwaysInclude, ...(await loadUsers())])];
          usersAt = Date.now();
        } catch (err) {
          logger.warn({ err: loggableError(err) }, "proactive: could not list active users");
        }
      }
      await forEachLimited(users, TICK_CONCURRENCY, (id) => proactiveTick(id));
      if (Date.now() - lapsedAt > LAPSED_EVERY_MS) {
        lapsedAt = Date.now();
        try {
          lapsed = await loadLapsed(users);
        } catch (err) {
          logger.warn({ err: loggableError(err) }, "proactive: could not list lapsed users");
        }
        await forEachLimited(lapsed, TICK_CONCURRENCY, (id) =>
          lapseOnlyTick(id).then(() => undefined, (err) => logger.warn({ err: loggableError(err) }, "lapse tick failed")),
        );
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
