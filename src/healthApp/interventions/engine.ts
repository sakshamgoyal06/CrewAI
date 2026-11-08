/**
 * The intervention loop: notice → offer → trial → check → confirm.
 *
 * Once a day per person (inside the proactive tick) the engine loads the last three weeks, runs
 * the detectors, reviews trials that are due, and offers at most one change. No model call:
 * detection, card text and verdicts are code and templates; the model only joins when the person
 * taps "Talk it through" or writes about it in chat.
 *
 * Caps (PRD): one card a day, two a week (safety excepted), one open offer or trial per area,
 * "Keep as is" silences that pattern on that area for 21 days, an offer expires after 7 days.
 * A trial never changes the agreed plan; only the person's yes after a successful check does.
 */
import { logger } from "../../logger.js";
import { localDateKey } from "../../nutrition/localDate.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import type { ActionContext } from "../actions.js";
import { getActivities } from "../activityLog.js";
import { getActiveGoal, getBodyCheckins } from "../bodyStore.js";
import { loadCalorieReview, type CalorieReview } from "../calorieTarget.js";
import { rememberLine } from "../coachMemory.js";
import { computeGoalProgress } from "../goalProgress.js";
import { getPrefs, isQuiet, sendNotification } from "../push.js";
import { loadDayRecords, type DayRecord } from "../rca.js";
import { loadHealthProfile } from "../snapshot.js";
import { getRoutineChecks } from "../routineStore.js";
import { getWorkoutChecks, postCoachMessage } from "../workoutCheckStore.js";
import { detectAll, detectOverAmbitious, itemHistory, itemHitRate, T, type DetectInput, type SessionRow } from "./detectors.js";
import { BANNED, buildOffer, GOAL_TALK_PROMPT, shortDate, type OfferContext } from "./options.js";
import { agreedSnapshot, applySnapshot, beforeOf, liveSnapshot, listVersions, originalDeadline, saveVersion, withChange, writeChange } from "./plan.js";
import { cardFromIntervention } from "./card.js";
import { getIntervention, insertIntervention, listInterventions, updateIntervention } from "./store.js";
import {
  OPEN_STATUSES,
  REASON_CHOICES,
  type CauseId,
  type Finding,
  type Intervention,
  type InterventionCard,
  type ReasonChoice,
} from "./types.js";
import { DAY_MS, dateOf, localClock, localHourOf } from "../../util/time.js";

const dayN = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const pct = (r: number | null) => (r === null ? "?" : `${Math.round(r * 100)}%`);

export const CAPS = { perWeek: 2, keptQuietDays: 21, repeatQuietDays: 7, offerExpiryDays: 7, ambitiousQuietDays: 30 };
/** Local hours the engine may post in. */
const POST_FROM_HOUR = 8;
const POST_UNTIL_HOUR = 21;

// ---------- choosing what to offer ----------

/** The one finding to offer today, after cooldowns and caps. Pure. */
export function selectFinding(findings: Finding[], history: Intervention[], today: string): Finding | null {
  const ageDays = (i: Intervention) => dayN(today) - dayN(i.localDate);
  const counted = history.filter((h) => h.status !== "info" || ageDays(h) === 0);
  const postedToday = counted.some((h) => ageDays(h) === 0);
  const thisWeek = counted.filter((h) => ageDays(h) < 7).length;
  const ok = findings.filter((f) => {
    if (history.some((h) => h.area === f.area && OPEN_STATUSES.includes(h.status))) return false;
    const same = history.filter((h) => h.pattern === f.pattern && h.area === f.area);
    if (same.some((h) => h.status === "kept" && ageDays(h) < CAPS.keptQuietDays)) return false;
    if (same.some((h) => ageDays(h) < CAPS.repeatQuietDays)) return false;
    if (f.pattern === "over_ambitious" && history.some((h) => h.pattern === "over_ambitious" && ageDays(h) < CAPS.ambitiousQuietDays)) return false;
    if (postedToday) return false;
    if (f.pattern !== "safety" && thisWeek >= CAPS.perWeek) return false;
    return true;
  });
  return ok.sort((a, b) => b.weight - a.weight)[0] ?? null;
}

// ---------- measuring a trial ----------

/** Share of good days for what the change aims at, from `from` on. Null when there's too little to judge. */
export function measure(i: Pick<Intervention, "pattern" | "itemId" | "area">, input: DetectInput, from: string): number | null {
  const records = input.records.filter((r) => r.date >= from);
  if (i.itemId) {
    const item = input.routine.find((x) => x.id === i.itemId);
    return item ? itemHitRate(itemHistory(item, { ...input, records })) : null;
  }
  const target = input.targets.calorieTarget;
  const judged = records.filter((r) => r.mealSessions >= 2);
  const share = (rs: DayRecord[], ok: (r: DayRecord) => boolean) => (rs.length >= 3 ? rs.filter(ok).length / rs.length : null);
  switch (i.pattern) {
    case "calories_over":
    case "calories_under":
    case "rebound":
      return target ? share(judged, (r) => r.calories >= target * T.bandLow && r.calories <= target * T.bandHigh) : null;
    case "safety":
      return share(judged, (r) => r.calories >= input.floorKcal);
    case "protein_short":
      return input.targets.proteinTarget ? share(judged, (r) => r.proteinG >= input.targets.proteinTarget! * T.proteinShare) : null;
    case "logging_fading":
      return share(records, (r) => r.mealSessions >= 2);
    default:
      return null;
  }
}

// ---------- loading ----------

export type Loaded = { input: DetectInput; timezone: string; review: CalorieReview | null };

async function bodyBasics(userProfileId: string): Promise<{ sex: string | null; birthYear: number | null; heightCm: number | null }> {
  const { data } = await supabase.from("user_health_profile").select("sex, birth_year, height_cm").eq("user_profile_id", userProfileId).maybeSingle();
  const d = (data ?? {}) as Record<string, unknown>;
  return { sex: d.sex ? String(d.sex) : null, birthYear: d.birth_year ? Number(d.birth_year) : null, heightCm: d.height_cm ? Number(d.height_cm) : null };
}

/** Higher of 1,200 kcal and Mifflin-St Jeor BMR (the onboarding formula). Pure. */
export function calorieFloor(b: { sex: string | null; birthYear: number | null; heightCm: number | null }, weightKg: number | null, today: string): { floor: number; bmr: number | null } {
  if (!b.sex || !b.birthYear || !b.heightCm || !weightKg) return { floor: 1200, bmr: null };
  const age = Number(today.slice(0, 4)) - b.birthYear;
  const bmr = Math.round(10 * weightKg + 6.25 * b.heightCm - 5 * age + (b.sex === "male" ? 5 : -161));
  return { floor: Math.max(1200, Math.ceil(bmr / 50) * 50), bmr };
}

const localHour = localHourOf;

export async function loadDetectInput(userProfileId: string, now: Date): Promise<Loaded> {
  const loaded = await loadDayRecords(userProfileId, now);
  const { records, targets, timezone, workouts } = loaded;
  const today = localDateKey(now, timezone);
  const from = records[0]?.date ?? today;
  const to = records.at(-1)?.date ?? today;
  const [routineChecks, gymChecks, activities, goal, checkins, review, basics, routine] = await Promise.all([
    getRoutineChecks(userProfileId, from, to),
    getWorkoutChecks(userProfileId, from, to),
    getActivities(userProfileId, from, to).catch(() => []),
    getActiveGoal(userProfileId),
    getBodyCheckins(userProfileId, dateOf(dayN(today) - 180)),
    loadCalorieReview(userProfileId, now).catch(() => null),
    bodyBasics(userProfileId),
    liveSnapshot(userProfileId).then((s) => s.routine),
  ]);
  const lastWeight = [...checkins].reverse().find((c) => c.weight_kg !== null)?.weight_kg ?? null;
  const { floor, bmr } = calorieFloor(basics, lastWeight, today);
  const sessions: SessionRow[] = [
    ...workouts.map((w) => ({ key: "gym", localDate: w.localDate, startHour: w.startTime ? localHour(w.startTime, timezone) : null, durationMin: w.durationMin })),
    ...activities.filter((a) => !a.duplicateOf).map((a) => ({ key: a.key, localDate: a.localDate, startHour: a.startTime ? localHour(a.startTime, timezone) : null, durationMin: a.durationMin })),
  ];
  const input: DetectInput = {
    today,
    records,
    targets,
    routine,
    routineChecks: [...routineChecks.values()].map((c) => ({ itemId: c.itemId, localDate: c.localDate, status: c.status, reason: c.reason })),
    gymChecks: [...gymChecks.values()].map((c) => ({ localDate: c.localDate, status: c.status, reason: c.reason })),
    sessions,
    goal: goal ? computeGoalProgress(goal, checkins, today) : null,
    review,
    floorKcal: floor,
    bmrKcal: bmr,
  };
  return { input, timezone, review };
}

async function offerContext(userProfileId: string, input: DetectInput, itemId: string | null): Promise<OfferContext> {
  const versions = await listVersions(userProfileId);
  const goal = input.goal ? { targets: input.goal.goal.targets, startDate: input.goal.goal.startDate, deadline: input.goal.goal.deadline } : null;
  return {
    today: input.today,
    targets: input.targets,
    review: input.review,
    goal: input.goal,
    originalDeadline: originalDeadline(versions, goal),
    floorKcal: input.floorKcal,
    item: itemId ? (input.routine.find((i) => i.id === itemId) ?? null) : null,
  };
}

// ---------- offering ----------

const LEAD: Record<string, string> = {
  safety: "This one is about your health, so it comes first.",
  default: "Something I noticed over the last few weeks, and a few ways to make it easier.",
};

/** Saves the offer and posts it in chat (push only for safety and goal-date findings). */
export async function offer(userProfileId: string, f: Finding, input: DetectInput, _now: Date): Promise<Intervention | null> {
  const ctx = await offerContext(userProfileId, input, f.itemId);
  const o = buildOffer(f, ctx);
  const text = [o.title, ...f.evidence, o.recommendation ?? "", ...o.options.map((x) => x.label)].join(" ");
  if (BANNED.test(text)) logger.warn({ pattern: f.pattern }, "intervention text hit the banned-word list");
  const baseline = measure({ pattern: f.pattern, itemId: f.itemId, area: f.area }, input, dateOf(dayN(input.today) - 14));
  const row = await insertIntervention(userProfileId, {
    pattern: f.pattern,
    cause: f.cause,
    area: f.area,
    item_id: f.itemId,
    item_label: f.itemLabel,
    local_date: input.today,
    title: o.title,
    evidence: f.evidence,
    facts: f.facts,
    options: o.options,
    recommendation: o.recommendation,
    status: o.options.length || f.cause === "unknown" ? "offered" : "info",
    baseline: { rate: baseline },
  });
  if (!row) return null;
  await postCoachMessage(userProfileId, LEAD[f.pattern] ?? LEAD.default!, [cardFromIntervention(row)]);
  if (f.pattern === "safety" || f.pattern === "deadline_drift") {
    const prefs = await getPrefs(userProfileId);
    if (!prefs.off.includes("intervention")) {
      await sendNotification(userProfileId, { kind: "intervention", dedupeKey: `intervention:${row.id}`, title: o.title, body: f.evidence[0] ?? o.title, url: "/app/#coach" });
    }
  }
  return row;
}

// ---------- reviewing trials ----------

function changeWords(i: Intervention): string {
  return i.options.find((o) => o.id === i.chosenOption)?.label ?? i.title;
}

/** Reviews trials that are due and expires old offers. Returns what it posted. */
export async function reviewDue(userProfileId: string, input: DetectInput, history: Intervention[]): Promise<number> {
  let posted = 0;
  for (const i of history) {
    if (i.status === "offered" && dayN(input.today) - dayN(i.localDate) >= CAPS.offerExpiryDays) {
      await updateIntervention(userProfileId, i.id, ["offered"], { status: "expired", closed_at: new Date().toISOString() });
      continue;
    }
    if (i.status !== "trial" || !i.reviewOn || i.reviewOn > input.today) continue;
    const from = i.startedAt ? localDateKeySafe(i.startedAt, input) : i.localDate;
    const rate = measure(i, input, from);
    const base = i.baseline?.rate ?? null;
    const what = changeWords(i);
    const extended = i.facts.extended === 1;
    if (rate === null && !extended) {
      await updateIntervention(userProfileId, i.id, ["trial"], { review_on: dateOf(dayN(input.today) + 7), facts: { ...i.facts, extended: 1 } });
      continue;
    }
    const helped = rate !== null && (base === null ? rate >= 0.7 : rate - base >= 0.2 || rate >= 0.8);
    if (rate !== null && !helped) {
      const r = i.before ? await writeChange(userProfileId, i.before) : { ok: true };
      const verdict = `"${what}" didn't move things (${pct(base)} → ${pct(rate)} of days), so your plan is back to how it was.`;
      const row = await updateIntervention(userProfileId, i.id, ["trial"], { status: "ended", verdict, closed_at: new Date().toISOString() });
      if (row) {
        await postCoachMessage(userProfileId, `${verdict} I'll look for a better fit.`, [cardFromIntervention(row)]);
        posted++;
      }
      if (!r.ok) logger.warn({ id: i.id, error: r.error }, "trial restore failed");
      continue;
    }
    const verdict = rate === null
      ? `Not enough days logged to tell whether "${what}" helped.`
      : base === null
        ? `"${what}": ${pct(rate)} of days since the change.`
        : `"${what}": ${pct(rate)} of days since the change, up from ${pct(base)}.`;
    const row = await updateIntervention(userProfileId, i.id, ["trial"], { status: "confirm", verdict });
    if (row) {
      await postCoachMessage(userProfileId, `${verdict} Make it your plan?`, [cardFromIntervention(row)]);
      posted++;
    }
  }
  return posted;
}

function localDateKeySafe(iso: string, input: DetectInput): string {
  // The trial's start date in the person's calendar; the records are already local dates.
  const d = iso.slice(0, 10);
  return input.records.some((r) => r.date === d) ? d : input.records.find((r) => r.date >= d)?.date ?? d;
}

// ---------- the daily pass ----------

const lastRun = new Map<string, string>();

/** One pass for a person: review trials, expire offers, offer at most one change. Once a day. */
export async function runInterventionTick(userProfileId: string, now = new Date(), timezone?: string, force = false): Promise<Intervention | null> {
  if (process.env.MAGNUS_INTERVENTIONS === "off") return null;
  const tz = timezone ?? (await loadHealthProfile(userProfileId)).timezone;
  const today = localDateKey(now, tz);
  if (!force) {
    if (lastRun.get(userProfileId) === today) return null;
    const { hour, hhmm } = localClock(now, tz);
    if (hour < POST_FROM_HOUR || hour >= POST_UNTIL_HOUR) return null;
    const prefs = await getPrefs(userProfileId);
    if (isQuiet(hhmm, prefs)) return null;
  }
  lastRun.set(userProfileId, today);
  const { input } = await loadDetectInput(userProfileId, now);
  const history = await listInterventions(userProfileId);
  await reviewDue(userProfileId, input, history);
  const fresh = await listInterventions(userProfileId);
  const pick = selectFinding(detectAll(input), fresh, input.today);
  return pick ? offer(userProfileId, pick, input, now) : null;
}

/**
 * Unanswered offers about the goal. Their numbers, options and recommendation were written for the
 * goal as it was when they were offered, so once the goal changes they describe a goal that no
 * longer exists (and "Move the goal to …" would overwrite the new deadline). Pure.
 */
export function goalOffersToClose(history: Intervention[]): Intervention[] {
  return history.filter((h) => h.area === "goal" && h.status === "offered");
}

export const GOAL_CHANGED_VERDICT = "Your goal changed after this was offered, so it no longer applies.";

/** Closes the unanswered goal offers after the goal changed. Never throws. */
export async function closeGoalOffers(userProfileId: string, history?: Intervention[]): Promise<number> {
  try {
    const stale = goalOffersToClose(history ?? (await listInterventions(userProfileId)));
    const stamp = new Date().toISOString();
    let closed = 0;
    for (const h of stale) {
      const row = await updateIntervention(userProfileId, h.id, ["offered"], { status: "expired", verdict: GOAL_CHANGED_VERDICT, closed_at: stamp });
      if (row) closed++;
    }
    return closed;
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "closing old goal offers failed");
    return 0;
  }
}

/**
 * After a goal is set: offers about the old goal are closed, then the new deadline is checked and
 * offered on right away when it isn't realistic.
 */
export async function checkNewGoal(userProfileId: string, now = new Date()): Promise<void> {
  try {
    await closeGoalOffers(userProfileId);
    const { input } = await loadDetectInput(userProfileId, now);
    const f = detectOverAmbitious(input);
    if (!f) return;
    await offer(userProfileId, f, input, now);
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "new goal check failed");
  }
}

export const NO_LONGER_VERDICT = "This no longer applies to your plan as it is now.";

/**
 * What to do with an offer still waiting from an earlier day: rebuilt from today's finding for the
 * same pattern and area (today's goal, logs and routine), or closed when there is none. Pure.
 */
export function refreshPlan(stale: Intervention[], findings: Finding[]): Array<{ i: Intervention; finding: Finding | null }> {
  return stale.map((i) => ({ i, finding: findings.find((f) => f.pattern === i.pattern && f.area === i.area && f.itemId === i.itemId) ?? null }));
}

/**
 * Each morning, before the day plan picks an offer: every offer from an earlier day is rebuilt
 * from today's data, or closed. Its numbers, options and recommendation are template text, so no
 * model call. The offer keeps its id and first day, so it still expires after CAPS.offerExpiryDays.
 */
export async function refreshOffers(userProfileId: string, now = new Date()): Promise<void> {
  const history = await listInterventions(userProfileId, 21);
  const waiting = history.filter((h) => h.status === "offered");
  if (!waiting.length) return;
  const { input } = await loadDetectInput(userProfileId, now);
  const stamp = new Date().toISOString();
  const age = (h: Intervention) => dayN(input.today) - dayN(h.localDate);
  for (const h of waiting.filter((x) => age(x) >= CAPS.offerExpiryDays)) {
    await updateIntervention(userProfileId, h.id, ["offered"], { status: "expired", closed_at: stamp });
  }
  const stale = waiting.filter((h) => age(h) > 0 && age(h) < CAPS.offerExpiryDays);
  if (!stale.length) return;
  for (const { i, finding } of refreshPlan(stale, detectAll(input))) {
    if (!finding) {
      await updateIntervention(userProfileId, i.id, ["offered"], { status: "expired", verdict: NO_LONGER_VERDICT, closed_at: stamp });
      continue;
    }
    // A cause the person gave ("no time") outlives the detector's guess.
    const f: Finding = { ...finding, cause: finding.cause === "unknown" ? i.cause : finding.cause };
    const o = buildOffer(f, await offerContext(userProfileId, input, f.itemId));
    await updateIntervention(userProfileId, i.id, ["offered"], {
      cause: f.cause,
      item_label: f.itemLabel,
      title: o.title,
      evidence: f.evidence,
      facts: f.facts,
      options: o.options,
      recommendation: o.recommendation,
      ...(o.options.length || f.cause === "unknown" ? {} : { status: "info" }),
    });
  }
}

// ---------- the person's answers ----------

export type RespondAction = "choose" | "keep" | "reason" | "cancel" | "confirm" | "decline";
export type RespondResult =
  | { ok: true; card: InterventionCard; talk?: string; message?: string }
  | { ok: false; error: string };

/** Cards saved before the wording fix still carry the old milestone prompt; send the new one. */
function talkPrompt(o: { id: string; prompt?: string }): string | undefined {
  return o.id === "milestone" ? GOAL_TALK_PROMPT : o.prompt;
}

const REVIEW_DAYS: Record<string, number> = { stalled: 14, deadline_drift: 14, over_ambitious: 14 };
const REASON_CAUSE: Record<Exclude<ReasonChoice, "away">, CauseId> = { time: "time", energy: "energy", enjoyment: "enjoyment", forgot: "forgot" };

function memoryFor(i: Intervention): string | null {
  const o = i.options.find((x) => x.id === i.chosenOption);
  if (!o) return null;
  const label = i.itemLabel ?? "The plan";
  const p = o.change.routineItem?.patch;
  const b = i.before?.routineItem?.patch;
  if (p?.startTime && b?.startTime) return `${label} sticks better at ${p.startTime} than ${b.startTime}.`;
  if (p?.durationMin) return `${label} sticks better at ${p.durationMin} min.`;
  if (p?.days) return `${label} works on ${p.days.length} days a week.`;
  if (o.change.targets?.calorieTarget && i.before?.targets?.calorieTarget) return `A ${o.change.targets.calorieTarget} kcal target fits them better than ${i.before.targets.calorieTarget}.`;
  if (o.change.experiment) return `What worked for them: ${o.change.experiment.slice(0, 150)}`;
  return null;
}

/** The person's tap on a card, or the coach's tool call on their behalf. */
export async function respond(
  ctx: ActionContext,
  id: string,
  action: RespondAction,
  opts: { optionId?: string; reason?: string } = {},
): Promise<RespondResult> {
  const now = new Date(ctx.now ?? Date.now());
  const today = localDateKey(now, ctx.timezone);
  const i = await getIntervention(ctx.userProfileId, id);
  if (!i) return { ok: false, error: "not_found" };
  const done = (row: Intervention | null, extra: { talk?: string; message?: string } = {}): RespondResult =>
    row ? { ok: true, card: cardFromIntervention(row), ...extra } : { ok: false, error: "already_answered" };
  const stamp = new Date().toISOString();

  switch (action) {
    case "keep": {
      const row = await updateIntervention(ctx.userProfileId, id, ["offered"], { status: "kept", answered_at: stamp, closed_at: stamp });
      if (row && i.itemLabel) {
        await rememberLine(ctx.userProfileId, `Wants to keep ${i.itemLabel} as planned; don't suggest changing it for now.`, "coach", { until: dateOf(dayN(today) + CAPS.keptQuietDays), today }).catch(() => null);
      }
      return done(row, { message: "Kept as is. I won't bring this up again for three weeks." });
    }
    case "reason": {
      if (i.status !== "offered") return { ok: false, error: "already_answered" };
      const reason = opts.reason as ReasonChoice | undefined;
      if (!reason || !REASON_CHOICES.includes(reason)) return { ok: false, error: "invalid_reason" };
      if (reason === "away") {
        const row = await updateIntervention(ctx.userProfileId, id, ["offered"], { status: "kept", verdict: "Paused while they're away or unwell.", answered_at: stamp, closed_at: stamp });
        return done(row, { message: "Got it. I'll leave it alone until you're back." });
      }
      const { input } = await loadDetectInput(ctx.userProfileId, now);
      const f: Finding = { pattern: i.pattern, cause: REASON_CAUSE[reason], area: i.area, itemId: i.itemId, itemLabel: i.itemLabel, weight: 0, evidence: i.evidence, facts: i.facts };
      const o = buildOffer(f, await offerContext(ctx.userProfileId, input, i.itemId));
      const row = await updateIntervention(ctx.userProfileId, id, ["offered"], { cause: f.cause, options: o.options, recommendation: o.recommendation, title: o.title });
      return done(row);
    }
    case "choose": {
      if (i.status !== "offered") return { ok: false, error: "already_answered" };
      const o = i.options.find((x) => x.id === opts.optionId);
      if (!o) return { ok: false, error: "unknown_option" };
      if (o.kind === "talk") return { ok: true, card: cardFromIntervention(i), talk: talkPrompt(o) ?? `Let's talk about "${i.title}".` };
      const open = (await listInterventions(ctx.userProfileId)).filter((h) => h.id !== id && (h.status === "trial" || h.status === "confirm"));
      if (open.some((h) => h.area === i.area)) return { ok: false, error: "trial_running" };
      const live = await liveSnapshot(ctx.userProfileId);
      const agreed = agreedSnapshot(live, open);
      const [latest] = await listVersions(ctx.userProfileId, 1);
      if (!latest) await saveVersion(ctx.userProfileId, agreed, "Your plan before the coach's first change");

      // A new deadline alone has nothing to try out: the person's tap is the agreement.
      const onlyDeadline = !!o.change.deadline && !o.change.targets && !o.change.routineItem && !o.change.experiment;
      if (onlyDeadline) {
        const r = await applySnapshot(ctx.userProfileId, withChange(live, { deadline: o.change.deadline }), live);
        if (!r.ok) return { ok: false, error: r.error ?? "apply_failed" };
        await saveVersion(ctx.userProfileId, withChange(agreed, { deadline: o.change.deadline }), `Goal date moved to ${shortDate(o.change.deadline!, today)}`, id);
        const row = await updateIntervention(ctx.userProfileId, id, ["offered"], { status: "applied", chosen_option: o.id, answered_at: stamp, closed_at: stamp, applied: o.change });
        return done(row, { message: `Your goal date is now ${shortDate(o.change.deadline!, today)}.` });
      }
      const { deadline, ...now_ } = o.change;
      const before = beforeOf(live, now_);
      const r = await writeChange(ctx.userProfileId, now_);
      if (!r.ok) return { ok: false, error: r.error ?? "apply_failed" };
      const reviewOn = dateOf(dayN(today) + (REVIEW_DAYS[i.pattern] ?? 7));
      const row = await updateIntervention(ctx.userProfileId, id, ["offered"], {
        status: "trial",
        chosen_option: o.id,
        answered_at: stamp,
        started_at: stamp,
        before,
        applied: now_,
        deferred: deadline ? { deadline } : null,
        review_on: reviewOn,
      });
      if (!row) await writeChange(ctx.userProfileId, before);
      return done(row, { message: `Trying it until ${shortDate(reviewOn, today)}. Your plan stays as it was until we see how it goes; you can cancel any time.` });
    }
    case "cancel": {
      if (i.status !== "trial" && i.status !== "confirm") return { ok: false, error: "not_running" };
      const row = await updateIntervention(ctx.userProfileId, id, ["trial", "confirm"], { status: "cancelled", closed_at: stamp, verdict: "Cancelled; back to the agreed plan." });
      if (row && i.before) await writeChange(ctx.userProfileId, i.before);
      return done(row, { message: "Cancelled. Everything is back to your plan." });
    }
    case "decline": {
      const row = await updateIntervention(ctx.userProfileId, id, ["confirm"], { status: "ended", closed_at: stamp, answered_at: stamp });
      if (row && i.before) await writeChange(ctx.userProfileId, i.before);
      return done(row, { message: "Back to your plan as it was." });
    }
    case "confirm": {
      if (i.status !== "confirm") return { ok: false, error: "not_asking" };
      const live = await liveSnapshot(ctx.userProfileId);
      if (i.deferred?.deadline) {
        const r = await applySnapshot(ctx.userProfileId, withChange(live, { deadline: i.deferred.deadline }), live);
        if (!r.ok) return { ok: false, error: r.error ?? "apply_failed" };
      }
      const row = await updateIntervention(ctx.userProfileId, id, ["confirm"], { status: "confirmed", closed_at: stamp, answered_at: stamp });
      if (!row) return { ok: false, error: "already_answered" };
      const others = (await listInterventions(ctx.userProfileId)).filter((h) => h.id !== id && (h.status === "trial" || h.status === "confirm"));
      const after = agreedSnapshot(await liveSnapshot(ctx.userProfileId), others);
      await saveVersion(ctx.userProfileId, after, `Kept "${changeWords(i)}"`, id);
      const line = memoryFor(i);
      if (line) await rememberLine(ctx.userProfileId, line, "coach", { today }).catch(() => null);
      return done(row, { message: "Saved. That's your plan now." });
    }
    default:
      return { ok: false, error: "unknown_action" };
  }
}

/** Puts the plan back to an earlier version; running trials are cancelled first. */
export async function revertToVersion(ctx: ActionContext, versionId: string): Promise<{ ok: boolean; error?: string; version?: number }> {
  const versions = await listVersions(ctx.userProfileId, 100);
  const v = versions.find((x) => x.id === versionId);
  if (!v) return { ok: false, error: "not_found" };
  const stamp = new Date().toISOString();
  for (const t of (await listInterventions(ctx.userProfileId)).filter((h) => h.status === "trial" || h.status === "confirm")) {
    await updateIntervention(ctx.userProfileId, t.id, ["trial", "confirm"], { status: "cancelled", closed_at: stamp, verdict: `Cancelled when the plan went back to version ${v.version}.` });
  }
  const live = await liveSnapshot(ctx.userProfileId);
  const r = await applySnapshot(ctx.userProfileId, v.snapshot, live);
  if (!r.ok) return r;
  const g = v.snapshot.goal;
  if (g && (!live.goal || live.goal.deadline !== g.deadline || JSON.stringify(live.goal.targets) !== JSON.stringify(g.targets))) {
    await closeGoalOffers(ctx.userProfileId);
  }
  const saved = await saveVersion(ctx.userProfileId, v.snapshot, `Went back to version ${v.version}`);
  return { ok: true, version: saved?.version };
}

/** Records a plan the person set by hand (goal, targets, routine) as a new version. Never throws. */
export async function recordManualPlan(userProfileId: string, reason: string): Promise<void> {
  try {
    const open = (await listInterventions(userProfileId)).filter((h) => h.status === "trial" || h.status === "confirm");
    await saveVersion(userProfileId, agreedSnapshot(await liveSnapshot(userProfileId), open), reason);
  } catch (err) {
    logger.debug?.({ err: loggableError(err) }, "plan version not recorded");
  }
}

/** For the chat's context block: the person's open plan changes. */
export async function openInterventions(userProfileId: string): Promise<Intervention[]> {
  return (await listInterventions(userProfileId, 30)).filter((h) => OPEN_STATUSES.includes(h.status));
}

export { getInterventions } from "./store.js";
export { cardFromIntervention, interventionNote, interventionsLine } from "./card.js";
