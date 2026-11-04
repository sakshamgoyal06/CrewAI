/**
 * One chat thread per day. The app shows only today's messages; earlier days open from a
 * "Past days" screen. The model's history is NOT split: it still reads the last ~36 hours
 * (chat.ts historyWindow), with a date marker where the day changes, so "yesterday" carries over.
 *
 * Each morning the coach opens the day with a plan built from stored data only (no model call):
 * today's routine, targets, where the goal stands, how yesterday went, one thing worth a look,
 * and a short line to start on. An open plan-change card rides along with it.
 */
import { logger } from "../logger.js";
import { localDateKey, resolveTimezone } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import type { ChatCard } from "./chat.js";
import { cardFromIntervention } from "./interventions/card.js";
import { listInterventions } from "./interventions/store.js";
import type { Intervention } from "./interventions/types.js";
import type { CheckId } from "./northStar.js";
import { clock as mealClock, mealLines, planViewOrNull, SLOT_LABEL, type DayMealLine } from "./dietPlan/rhythm.js";
import { buildHealthSnapshot, type HealthSnapshot } from "./snapshot.js";
import { addDays, localClock, tzOffsetMs } from "../util/time.js";
import { stableTurnId } from "../util/stableId.js";

/** The day's plan isn't posted before this local hour, so a late-night chat doesn't get "Good morning". */
export const MORNING_FROM_HOUR = 5;
/** How far back the Past days screen reaches. */
export const PAST_DAYS = 90;

export type DayPlanCard = {
  type: "day_plan";
  date: string;
  greeting: string;
  /** Today's routine, in time order: "7:00 am", "Morning walk". Empty on a day with nothing planned. */
  plan: Array<{ time: string | null; label: string }>;
  /** "Training day", "Rest day", or null when the routine already says it. */
  dayKind: string | null;
  targets: Array<{ value: string; label: string }>;
  goal: string | null;
  yesterday: string | null;
  week: string;
  /** The one thing worth a look today, if any. */
  focus: string | null;
  motivation: string;
  /** Today's planned meals, when they use the meal plan. */
  meals?: DayMealLine[];
};

export type ChatDay = { date: string; count: number; preview: string };

// ---------- dates ----------

/** UTC instant of local midnight starting `date` in `timezone`. */
export function localMidnight(date: string, timezone: string): Date {
  const tz = resolveTimezone(timezone);
  const guess = Date.parse(`${date}T00:00:00Z`);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  // Once more, in case a DST change sits between the guess and the answer.
  t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

export { addDays };

/** [from, to) in UTC for one local day. */
export function localDayRange(date: string, timezone: string): { from: string; to: string } {
  return { from: localMidnight(date, timezone).toISOString(), to: localMidnight(addDays(date, 1), timezone).toISOString() };
}

export const isDateKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** "Tue 4 Nov", for history markers and the card. */
export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------- past days ----------

const PREVIEW_CHARS = 90;

function previewOf(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > PREVIEW_CHARS ? `${one.slice(0, PREVIEW_CHARS - 1).trimEnd()}…` : one;
}

/**
 * Rows → one entry per local day before `today`, newest first. The preview is the person's first
 * message that day (what the day was about), else the coach's first line.
 */
export function groupChatDays(
  rows: Array<{ role: string; content: string; createdAt: string }>,
  timezone: string,
  today: string,
): ChatDay[] {
  const days = new Map<string, { count: number; user: string | null; coach: string | null }>();
  for (const r of rows) {
    const date = localDateKey(new Date(r.createdAt), timezone);
    if (date >= today) continue;
    const d = days.get(date) ?? { count: 0, user: null, coach: null };
    d.count += 1;
    const text = r.content.trim();
    if (text) {
      if (r.role === "user" && !d.user) d.user = text;
      if (r.role === "assistant" && !d.coach) d.coach = text;
    }
    days.set(date, d);
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, d]) => ({ date, count: d.count, preview: previewOf(d.user ?? d.coach ?? "") }));
}

export async function listChatDays(userProfileId: string, timezone: string, now = new Date()): Promise<ChatDay[]> {
  const today = localDateKey(now, timezone);
  const { data, error } = await supabase
    .from("health_chat_messages")
    .select("role, content, created_at")
    .eq("user_profile_id", userProfileId)
    .gte("created_at", localMidnight(addDays(today, -PAST_DAYS), timezone).toISOString())
    .lt("created_at", localMidnight(today, timezone).toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`chat days: ${error.message}`);
  return groupChatDays(
    (data ?? []).map((r) => ({ role: String(r.role), content: String(r.content ?? ""), createdAt: String(r.created_at) })),
    timezone,
    today,
  );
}

// ---------- the morning plan ----------

/** A stable turn id per person per day, so the plan posts once however many places try. */
export function morningTurnId(userProfileId: string, date: string): string {
  return stableTurnId(`magnus-day-plan:${userProfileId}:${date}`);
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

function greetingFor(hour: number, name: string | null): string {
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

const PACE: Record<string, string> = {
  ahead: "ahead of pace",
  on_pace: "on pace",
  behind: "behind pace",
  reached: "reached",
  not_enough_data: "too early to call the pace",
};

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function goalLine(s: HealthSnapshot): string | null {
  const g = s.goal;
  if (!g) return null;
  const m = g.metrics.find((x) => x.latest != null) ?? g.metrics[0];
  if (!m) return null;
  const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const now = m.latest != null ? `${num(m.latest)} ${m.unit} now, ` : "";
  return `${m.label}: ${now}${num(m.target)} ${m.unit} by ${shortDate(g.goal.deadline)} · ${PACE[m.pace] ?? m.pace}`;
}

function yesterdayLine(s: HealthSnapshot): string | null {
  const y = s.northStar.days.at(-2);
  if (!y || !y.checks.length) return null;
  if (y.onTrack) return "On track. Every check was done.";
  const open = y.checks.filter((c) => !c.met);
  const met = y.checks.length - open.length;
  return `${met} of ${y.checks.length} checks. Open: ${open.map((c) => `${c.label.toLowerCase()} (${c.detail})`).join(", ")}.`;
}

/** A concrete first move for the check that slips most. */
const LEAD: Record<CheckId, string> = {
  meals_logged: "Log each meal right after you eat, one line is enough.",
  calories: "Plan dinner now, so the day's calories land on target.",
  protein: "Put protein in breakfast; the rest of the day gets easier.",
  steps: "A 20-minute walk after lunch covers most of the gap.",
  workout: "Put the session in your calendar like a meeting.",
  routine: "Pick the one routine item that matters most today and do that first.",
};

function focusLine(s: HealthSnapshot, intervention: Intervention | null): string | null {
  if (intervention) return `One thing to decide: ${intervention.title}. The options are below.`;
  if (s.goal?.checkinDue) return "Weekly weigh-in today: step on the scale before breakfast and tell me the number.";
  const missed = s.northStar.mostMissed;
  if (missed && missed.missedDays >= 2) {
    return `${missed.label} slipped on ${missed.missedDays} of the last 6 days. ${LEAD[missed.id]}`;
  }
  if (s.today.sleepMinutes != null && s.today.sleepMinutes < 6 * 60) {
    const h = Math.floor(s.today.sleepMinutes / 60);
    const mm = s.today.sleepMinutes % 60;
    return `You slept ${h}h ${mm}m. Keep training at an easy effort if you feel flat, and get to bed early.`;
  }
  return null;
}

/**
 * Short, plain lines to start the day on. No guilt words (the interventions BANNED list), no
 * hype: the same calm voice as the coach.
 */
export const MOTIVATION = [
  "Small days, done often, are what move the scale.",
  "You don't need a perfect day. You need a logged one.",
  "Consistency beats intensity. Show up, then adjust.",
  "The plan only works on the days you use it. Today is one of them.",
  "Progress is quiet. Trust the trend, not the morning number.",
  "Do the next right thing. Then the one after that.",
  "Every meal you log makes the next decision easier.",
  "Strong is built on ordinary days, one after another.",
  "Ten minutes counts. Start there.",
  "A good week is five good days. Make this one of them.",
  "Your future self is built from today's small choices.",
  "Protein first, water nearby, walk after meals. Simple wins.",
  "Effort you repeat beats effort you remember.",
  "Aim for done, not perfect.",
  "Energy follows action. Start, and the rest catches up.",
  "The best plan is the one you can keep. Keep it today.",
  "Habits are votes for who you're becoming. Cast a few today.",
  "One honest log, one walk, one good meal. That's a day.",
  "You've done hard days before. This one's yours too.",
  "Slow is fine. Stopping is the only thing that resets the clock.",
  "Results lag effort. Keep stacking the days.",
];

function motivationFor(date: string, s: HealthSnapshot): string {
  const streak = (() => {
    let n = 0;
    for (const d of s.northStar.days.slice(0, -1).reverse()) {
      if (!d.onTrack) break;
      n += 1;
    }
    return n;
  })();
  if (streak >= 3) return `${streak} days on track in a row. Keep the chain going today.`;
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return MOTIVATION[day % MOTIVATION.length]!;
}

/** The day's plan as a card plus a short text the model reads in history. Pure. */
export function buildDayPlan(input: { snapshot: HealthSnapshot; name: string | null; localHour: number; intervention: Intervention | null; meals?: DayMealLine[] }): { text: string; card: DayPlanCard } {
  const s = input.snapshot;
  const date = s.today.date;
  const plan = s.today.routine.map((r) => ({ time: r.startTime ? clock(r.startTime) : null, label: r.label }));
  const dayKind = plan.length
    ? null
    : s.today.isTrainingDay
      ? s.gym.time ? `Training day: gym at ${clock(s.gym.time)}` : "Training day"
      : "Rest day: walk, eat well, recover";
  const t = s.targets;
  const targets = [
    t.calorieTarget ? { value: fmt(t.calorieTarget), label: "kcal" } : null,
    t.proteinTarget ? { value: `${t.proteinTarget} g`, label: "protein" } : null,
    { value: fmt(t.stepTarget), label: "steps" },
  ].filter((x): x is { value: string; label: string } => x !== null);
  const card: DayPlanCard = {
    type: "day_plan",
    date,
    greeting: greetingFor(input.localHour, input.name),
    plan,
    dayKind,
    targets,
    goal: goalLine(s),
    yesterday: yesterdayLine(s),
    week: `${s.northStar.onTrackDays} of the last 7 days on track (aim: ${s.northStar.goal})`,
    focus: focusLine(s, input.intervention),
    motivation: motivationFor(date, s),
    ...(input.meals?.length ? { meals: input.meals } : {}),
  };
  return { text: dayPlanText(card), card };
}

/** The plan as plain lines: what the model sees in history, and the fallback for an old app. */
export function dayPlanText(c: DayPlanCard): string {
  const today = c.plan.length ? c.plan.map((p) => (p.time ? `${p.label} ${p.time}` : p.label)).join(" · ") : c.dayKind ?? "";
  return [
    `${c.greeting}. Today's plan for ${dayLabel(c.date)}.`,
    today ? `Today: ${today}.` : null,
    `Targets: ${c.targets.map((x) => `${x.value} ${x.label}`).join(" · ")}.`,
    c.meals?.length ? `Meals: ${c.meals.map((m) => `${SLOT_LABEL[m.slot]}${m.time ? ` ${mealClock(m.time)}` : ""} ${m.title} (${Math.round(m.kcal)} kcal)`).join(" · ")}.` : null,
    c.goal ? `Goal: ${c.goal}.` : null,
    c.yesterday ? `Yesterday: ${c.yesterday}` : null,
    `Week: ${c.week}.`,
    c.focus ? `Worth a look: ${c.focus}` : null,
    c.motivation,
  ].filter(Boolean).join("\n");
}

// ---------- posting it ----------

/** People whose plan was already handled today, so `GET /chat` skips the lookup. */
const handled = new Map<string, string>();

type ProfileBits = { name: string | null; onboardedOn: string | null; onboarded: boolean };

async function loadProfileBits(userProfileId: string, timezone: string): Promise<ProfileBits> {
  const [p, hp, goal] = await Promise.all([
    supabase.from("user_profile").select("display_name").eq("id", userProfileId).maybeSingle(),
    supabase.from("user_health_profile").select("onboarded_at").eq("user_profile_id", userProfileId).maybeSingle(),
    supabase.from("health_goals").select("id").eq("user_profile_id", userProfileId).limit(1),
  ]);
  const full = (p.data as { display_name?: string | null } | null)?.display_name?.trim() || null;
  const at = (hp.data as { onboarded_at?: string | null } | null)?.onboarded_at ?? null;
  return {
    name: full ? full.split(/\s+/)[0]! : null,
    onboardedOn: at ? localDateKey(new Date(at), timezone) : null,
    onboarded: !!at || (goal.data ?? []).length > 0,
  };
}

export type MorningResult = "posted" | "exists" | "too_early" | "not_ready";

/**
 * Posts today's plan into chat once a day, from MORNING_FROM_HOUR local. Called by the proactive
 * loop and by `GET /chat`, whichever comes first; the stable turn id and the unique index on
 * (user, turn_id, role) make a second insert fail instead of doubling it. Skips people who haven't
 * onboarded, and the day someone onboards (the welcome already opens that day).
 */
export async function ensureDayPlan(userProfileId: string, timezone: string, now = new Date()): Promise<MorningResult> {
  const tz = resolveTimezone(timezone);
  const date = localDateKey(now, tz);
  const key = `${userProfileId}|${date}`;
  if (handled.get(userProfileId) === date) return "exists";
  const { hour } = localClock(now, tz);
  if (hour < MORNING_FROM_HOUR) return "too_early";

  const turnId = morningTurnId(userProfileId, date);
  const existing = await supabase
    .from("health_chat_messages")
    .select("id")
    .eq("user_profile_id", userProfileId)
    .eq("turn_id", turnId)
    .limit(1);
  if (existing.error) throw new Error(`day plan lookup: ${existing.error.message}`);
  if ((existing.data ?? []).length) {
    handled.set(userProfileId, date);
    return "exists";
  }

  const bits = await loadProfileBits(userProfileId, tz);
  if (!bits.onboarded || bits.onboardedOn === date) {
    handled.set(userProfileId, date);
    return "not_ready";
  }
  const [snapshot, interventions, planView] = await Promise.all([
    buildHealthSnapshot(userProfileId, now),
    listInterventions(userProfileId, 21).catch(() => [] as Intervention[]),
    planViewOrNull({ userProfileId, timezone: tz, now }, now),
  ]);
  // The snapshot reads the timezone itself; if the two disagree, one of them is wrong. Posting
  // anyway would key the plan to one day and show another, and the real day would post again.
  if (snapshot.today.date !== date) {
    logger.warn({ userProfileId, date, snapshotDate: snapshot.today.date }, "day plan skipped: timezone mismatch");
    return "not_ready";
  }
  const open = interventions.find((i) => i.status === "offered" || i.status === "confirm") ?? null;
  const meals = planView ? mealLines(planView, date) : undefined;
  const { text, card } = buildDayPlan({ snapshot, name: bits.name, localHour: hour, intervention: open, meals });
  const cards: ChatCard[] = [card, ...(open ? [cardFromIntervention(open)] : [])];
  const { error } = await supabase
    .from("health_chat_messages")
    .insert({ user_profile_id: userProfileId, role: "assistant", content: text, cards, turn_id: turnId, status: "ok" });
  handled.set(userProfileId, date);
  if (error) {
    // 23505: another caller posted it first.
    if (error.code === "23505") return "exists";
    handled.delete(userProfileId);
    throw new Error(`day plan insert: ${error.message}`);
  }
  logger.info({ userProfileId, date, key }, "day plan posted");
  return "posted";
}

/** ensureDayPlan for request paths: never fails the request it rides on. */
export async function tryDayPlan(userProfileId: string, timezone: string, now = new Date()): Promise<void> {
  try {
    await ensureDayPlan(userProfileId, timezone, now);
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "day plan failed");
  }
}

/** Test hook. */
export function resetDayPlanMemo(): void {
  handled.clear();
}
