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
import { ensureDayPlan } from "./dailyChat.js";
import { routineLine } from "./routine.js";
import { runRoutineTick } from "./routineCheck.js";
import { runInterventionTick } from "./interventions/engine.js";
import { runDayClose, runMealTimeTick } from "./dietPlan/rhythm.js";
import { runWorkoutChecks, SCHEDULER_INTERVAL_MS } from "./workoutCheck.js";
import { runNightlyDigest } from "./nightlyDigest.js";
import { hasFeature } from "./billing.js";
import { isAccountDisabled } from "./accountStatus.js";
import { postCoachMessage } from "./workoutCheckStore.js";
import { DAY_MS, localClock } from "../util/time.js";

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

/**
 * The nudges due at `now`, given today's snapshot. Pure. Each has a per-day dedupe key; the
 * sender drops any already sent.
 */
export function dueNudges(s: HealthSnapshot, now: Date, prefs: NotificationPrefs): Notification[] {
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
      `Week so far: ${s.northStar.onTrackDays}/7 on track.`,
    ];
    out.push({ kind: "morning_plan", dedupeKey: `morning_plan:${date}`, title: "Today's plan", body: parts.join(" "), url: "/app/#coach" });
  }

  if (s.goal?.checkinDue && inWindow("08:30")) {
    out.push({ kind: "weigh_in", dedupeKey: `weigh_in:${date}`, title: "Weekly weigh-in", body: "Step on the scale before breakfast and log it, so the goal pace stays honest.", url: "/app/#tracker" });
  }

  const logged = new Set(s.meals.map((m) => m.slot));
  for (const [slot, time, label] of [
    ["breakfast", "10:30", "Breakfast"],
    ["lunch", "14:30", "Lunch"],
    ["dinner", "21:15", "Dinner"],
  ] as const) {
    if (!logged.has(slot) && inWindow(time)) {
      out.push({ kind: "meal_reminder", dedupeKey: `meal_reminder:${slot}:${date}`, title: `${label} not logged`, body: "Tell me what you had in a line and I'll estimate it.", url: "/app/#coach" });
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
    out.push({
      kind: "evening_wrap",
      dedupeKey: `evening_wrap:${date}`,
      title: s.today.onTrack ? "On track today" : "Still open today",
      body: s.today.onTrack
        ? `Every check is done. ${s.northStar.onTrackDays}/7 this week.`
        : `${open.map((c) => `${c.label} (${c.detail})`).join(", ")}.`,
      url: "/app/#tracker",
    });
  }

  return out.filter((n) => !prefs.off.includes(n.kind));
}

async function runNudges(userProfileId: string, now: Date): Promise<number> {
  const [snapshot, prefs] = await Promise.all([buildHealthSnapshot(userProfileId, now), getPrefs(userProfileId)]);
  let sent = 0;
  for (const n of dueNudges(snapshot, now, prefs)) {
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
    lastTwoDaysOffTrack: lastTwo.length === 2 && lastTwo.every((d) => !d.onTrack),
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

/** One pass of everything proactive. Each part fails on its own without stopping the others. */
export async function proactiveTick(userProfileId: string, now = new Date()): Promise<void> {
  // A paused account gets no pushes, digests or analyses (and costs nothing) until it's re-enabled.
  if (await isAccountDisabled(userProfileId)) return;
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
): () => void {
  let running = false;
  let users: string[] = [...alwaysInclude];
  let usersAt = 0;
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
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
