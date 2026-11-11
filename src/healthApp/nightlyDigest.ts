/**
 * Nightly coach digest: at 21:30 local, one short message in the day's chat that says how the
 * day went (with its numbers) and the one thing to do tomorrow. It replaces the plain "evening
 * wrap" push for that night: the push carries the digest's first line and opens the chat.
 *
 * One small model call per person per night (Haiku: about $0.0004), only on days with at least
 * one meal logged. When the call fails, a rule-based digest goes out instead. Off switch:
 * MAGNUS_DIGEST=off.
 */
import { dayMealLines } from "./dayMeals.js";
import type Anthropic from "@anthropic-ai/sdk";

import { logger } from "../logger.js";
import { digestModel } from "../models.js";
import { anthropic, supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import { stableTurnId } from "../util/stableId.js";
import { localClock } from "../util/time.js";
import { hasFeature } from "./billing.js";
import { nameRestrictionCheck, type PersonDiet } from "./dietPlan/compose.js";
import { planRules } from "./dietPlan/rules.js";
import { foodPrefsLine, loadFoodPrefs, planRulesLine, type FoodPrefs } from "./onboarding.js";
import { getPrefs, isQuiet, sendNotification } from "./push.js";
import { buildHealthSnapshot, type HealthSnapshot } from "./snapshot.js";
import { trainingDayOn } from "./routine.js";

export const DIGEST_AT = "21:30";
const DIGEST_WINDOW_MIN = 90;
const MAX_CHARS = 600;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** With a meal plan the note waits for the day close (from 21:45, or an hour after a late last meal), up to this. */
const DIGEST_LATEST = "23:50";

export function digestDue(minutes: number, opts: { waitsForDayClose?: boolean } = {}): boolean {
  const end = opts.waitsForDayClose ? at(DIGEST_LATEST) : at(DIGEST_AT) + DIGEST_WINDOW_MIN;
  return minutes >= at(DIGEST_AT) && minutes < end;
}

/**
 * The day close and the note are one evening: with a meal plan, the note comes after the day
 * close and knows what it set for tomorrow (the carry and tomorrow's meals), so its tip never
 * contradicts the plan. Before the close has posted the note waits; if it never does by 23:50,
 * the note goes out on its own.
 */
export type DayCloseState = { hasPlan: boolean; text: string | null };

async function loadDayClose(userProfileId: string, date: string): Promise<DayCloseState> {
  const { data: prefs } = await supabase.from("health_diet_preferences").select("user_profile_id").eq("user_profile_id", userProfileId).maybeSingle();
  if (!prefs) return { hasPlan: false, text: null };
  const { data } = await supabase
    .from("health_chat_messages")
    .select("content")
    .eq("user_profile_id", userProfileId)
    .eq("turn_id", stableTurnId(`magnus-day-close:${userProfileId}:${date}`))
    .limit(1);
  const row = (data ?? [])[0] as { content?: string } | undefined;
  return { hasPlan: true, text: row?.content ?? null };
}

/** The day as plain facts for the model (and the fallback). */
export function digestFacts(s: HealthSnapshot, weekday: number): Record<string, unknown> {
  const t = s.targets;
  const tomorrow = (weekday + 1) % 7;
  return {
    today: WEEKDAYS[weekday],
    calories: t.calorieTarget ? `${fmt(s.today.calories)} of ${fmt(t.calorieTarget)} kcal` : `${fmt(s.today.calories)} kcal (no target)`,
    protein: t.proteinTarget ? `${Math.round(s.today.proteinG)} of ${t.proteinTarget} g` : `${Math.round(s.today.proteinG)} g`,
    steps: `${fmt(s.today.steps)} of ${fmt(t.stepTarget)}`,
    meals: s.mealList ? dayMealLines(s.mealList) : s.meals.map((m) => `${m.slot}: ${m.text.slice(0, 80)} (${fmt(m.calories)} kcal, ${Math.round(m.proteinG)} g protein)`),
    trainingDay: s.today.isTrainingDay,
    trainedToday: s.workouts.some((w) => w.localDate === s.today.date),
    checks: s.today.checks.map((c) => `${c.label}: ${c.met ? "done" : "missed"} (${c.detail})`),
    onTrackToday: s.today.onTrack,
    weekOnTrack: `${s.northStar.onTrackDays} of 7 days`,
    tomorrow: `${WEEKDAYS[tomorrow]}, ${trainingDayOn(nextDate(s.today.date), t.trainingDays, s.routine) ? "training day" : "rest day"}`,
    sleepLastNight: s.today.sleepMinutes ? `${(s.today.sleepMinutes / 60).toFixed(1)} h` : null,
    goal: s.goal
      ? s.goal.metrics.map((m) => `${m.label} ${m.latest ?? "?"} → ${m.target} ${m.unit}, pace ${m.pace}`).join("; ") + `; ${s.goal.weeksLeft} weeks left`
      : null,
  };
}

/** A digest without the model: the first missed check with its number, and a matching fix. */
export function fallbackDigest(s: HealthSnapshot): string {
  const missed = s.today.checks.filter((c) => !c.met);
  if (!missed.length) return `Every check done today, ${s.northStar.onTrackDays} of 7 days on track this week. Same again tomorrow.`;
  const first = missed[0]!;
  const fix: Record<string, string> = {
    protein: "Tomorrow, put 30 g of protein into breakfast so the evening isn't a catch-up.",
    calories: "Tomorrow, log each meal as you eat it so the total stays in range.",
    steps: "Tomorrow, take a 15-minute walk after lunch.",
    workout: "Tomorrow, set out your gym kit tonight.",
    meals_logged: "Tomorrow, log each meal as you eat it.",
  };
  return `Today: ${missed.map((c) => `${c.label.toLowerCase()} missed (${c.detail})`).join(", ")}. ${fix[first.id] ?? "Pick one of these to fix tomorrow."}`;
}

const SYSTEM = `You are Magnus, a health coach, writing the person's end-of-day note. You get today's numbers.
Write 2 or 3 short sentences, second person, plain words, no lists, no emoji, no greeting:
1. How the day went, quoting the numbers that matter most (good or bad).
2. ONE specific thing to do tomorrow (a food, a time, an amount), chosen to fix today's biggest gap or keep a good streak. Use what tomorrow is (training or rest day).
Never invent numbers. Under 400 characters.
If the facts include dayClose, tomorrow's meals and calories are already set there (the person just read it): don't repeat its numbers or suggest a different food for tomorrow; make your one thing about something else (steps, sleep, training, timing) or simply sticking to tomorrow's plan.
If the facts include foodRules, they are hard rules: any food you name must obey them (never name a meat, fish, egg or food they rule out). A TEMPORARY RULE overrides their usual diet: while it runs, foods the usual diet allows but the temporary rule rules out are out.`;

type Create = (p: Record<string, unknown>) => Promise<Anthropic.Message>;

export async function writeDigest(
  facts: Record<string, unknown>,
  fallback: string,
  create: Create = (p) => anthropic.messages.create(p as never) as Promise<Anthropic.Message>,
): Promise<{ text: string; source: "model" | "fallback" }> {
  try {
    const msg = await create({
      model: digestModel(),
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if ((msg.stop_reason as string) !== "refusal" && text.length >= 20) return { text: text.slice(0, MAX_CHARS), source: "model" };
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "nightly digest model call failed");
  }
  return { text: fallback, source: "fallback" };
}

async function alreadyPosted(userProfileId: string, turnId: string): Promise<boolean> {
  const { data, error } = await supabase.from("health_chat_messages").select("id").eq("user_profile_id", userProfileId).eq("turn_id", turnId).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** First sentence, for the push body. */
const firstSentence = (text: string) => (/^.*?[.!?](\s|$)/.exec(text)?.[0] ?? text).trim().slice(0, 180);

/** Their food rules for the digest, and a check that a written note keeps them. */
export type DigestFoodRules = { line: string | null; allows: (text: string) => boolean; diet?: PersonDiet };

/**
 * The rules the note's food tip must keep: a running temporary diet ("veg only till the 25th")
 * first, since it overrides their usual diet, then their usual diet and avoid list. The tip is
 * for tomorrow, so the check uses tomorrow's rules. Pure.
 */
export function digestFoodRules(food: FoodPrefs | null, prefs: unknown, today: string, tomorrow: string): DigestFoodRules {
  const temp = planRulesLine(prefs, today);
  const usual = food ? foodPrefsLine({ diet: food.diet, diet_note: food.dietNote, food_avoid: food.foodAvoid }) : null;
  const line = [temp, usual ? `usual diet: ${usual}` : null].filter(Boolean).join(". ") || null;
  const p = (prefs ?? {}) as { restrictions?: string[]; fastingDays?: number[]; dietOverride?: unknown };
  const rules = planRules(
    food ?? { diet: null, dietNote: null, foodAvoid: [] },
    { restrictions: p.restrictions ?? [], fastingDays: p.fastingDays ?? [], dietOverride: (p.dietOverride ?? null) as never },
    tomorrow,
  );
  const ok = nameRestrictionCheck({ diet: rules.diet, avoid: rules.avoid });
  return { line, allows: (text) => ok(text), diet: rules.diet };
}

/** Their food rules for `tomorrow` (a temporary diet first): the nightly note, the eating-out card and the RCA read the same. */
export async function loadDigestFoodRules(userProfileId: string, today: string, tomorrow: string): Promise<DigestFoodRules> {
  const [food, dp] = await Promise.all([
    loadFoodPrefs(userProfileId).catch(() => null),
    (async () => {
      const { data } = await supabase.from("health_diet_preferences").select("prefs").eq("user_profile_id", userProfileId).maybeSingle();
      return (data as { prefs?: unknown } | null)?.prefs ?? null;
    })().catch(() => null),
  ]);
  return digestFoodRules(food, dp, today, tomorrow);
}

const nextDate = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export type DigestDeps = { snapshot: typeof buildHealthSnapshot; write: typeof writeDigest; foodRules?: typeof loadDigestFoodRules; dayClose?: typeof loadDayClose };

export async function runNightlyDigest(
  userProfileId: string,
  now = new Date(),
  deps: DigestDeps = { snapshot: buildHealthSnapshot, write: writeDigest, foodRules: loadDigestFoodRules },
): Promise<"off" | "not_yet" | "exists" | "nothing_logged" | "not_included" | "posted"> {
  if (process.env.MAGNUS_DIGEST === "off") return "off";
  const s = await deps.snapshot(userProfileId, now);
  const { minutes, weekday, hhmm } = localClock(now, s.timezone);
  if (!digestDue(minutes, { waitsForDayClose: true })) return "not_yet";
  const close = await (deps.dayClose ?? loadDayClose)(userProfileId, s.today.date).catch((): DayCloseState => ({ hasPlan: false, text: null }));
  if (!digestDue(minutes, { waitsForDayClose: close.hasPlan })) return "not_yet";
  if (close.hasPlan && !close.text && minutes < at(DIGEST_LATEST) - 10) return "not_yet";
  const turnId = stableTurnId(`magnus-digest:${userProfileId}:${s.today.date}`);
  if (await alreadyPosted(userProfileId, turnId)) return "exists";
  // Without a single meal there is nothing to review; the plain evening push still goes out.
  if (!s.meals.length) return "nothing_logged";
  // A Pro feature once billing is on: the free plan keeps the plain evening push.
  if (!(await hasFeature(userProfileId, "digest", now))) return "not_included";

  const rules = await (deps.foodRules ?? loadDigestFoodRules)(userProfileId, s.today.date, nextDate(s.today.date));
  const fallback = fallbackDigest(s);
  const written = await deps.write({ ...digestFacts(s, weekday), ...(rules.line ? { foodRules: rules.line } : {}), ...(close.text ? { dayClose: close.text.slice(0, 500) } : {}) }, fallback);
  // The model was told the rules; a note that still names a food they ruled out never goes out.
  const broke = written.source === "model" && !rules.allows(written.text);
  if (broke) logger.warn({ userProfileId }, "nightly digest named a food outside their rules; using the fallback");
  const { text, source } = broke ? { text: fallback, source: "fallback" as const } : written;
  const { error } = await supabase
    .from("health_chat_messages")
    .insert({ user_profile_id: userProfileId, role: "assistant", content: text, cards: [], turn_id: turnId, status: "ok" });
  if (error) {
    if (error.code === "23505") return "exists";
    throw new Error(error.message);
  }
  logger.info({ source }, "nightly digest posted");

  const prefs = await getPrefs(userProfileId);
  if (!prefs.off.includes("evening_wrap") && !isQuiet(hhmm, prefs)) {
    // Same dedupe key as the plain evening wrap, so only one evening push goes out.
    await sendNotification(userProfileId, {
      kind: "evening_wrap",
      dedupeKey: `evening_wrap:${s.today.date}`,
      title: "Your day, in short",
      body: firstSentence(text),
      url: "/app/#coach",
    });
  }
  return "posted";
}
