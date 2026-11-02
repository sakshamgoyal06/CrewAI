/**
 * Activities outside Hevy: swimming, running, football, badminton, yoga, cycling and the rest.
 * Pure logic only (catalog, burn estimates, overlap rules, the day's burn total and the training
 * rules), so all of it is easy to test. Storage lives in `activityLog.ts`.
 *
 * Burn per activity, in order of trust: the device's number for that session, a number the person
 * typed, then a MET estimate. The estimate counts only the burn above resting,
 * (MET − 1) × kg × hours, because resting burn is already part of maintenance.
 *
 * MET values follow the Compendium of Physical Activities (2024), rounded and grouped into
 * easy / moderate / hard.
 */

export type Intensity = "easy" | "moderate" | "hard";
export const INTENSITIES: Intensity[] = ["easy", "moderate", "hard"];

export type CatalogEntry = {
  key: string;
  label: string;
  /** MET for easy / moderate / hard. */
  met: [number, number, number];
  /** Free-text and Health Connect type matches (lower-case). */
  match: RegExp;
  /** Steps per minute while doing it, for activities the phone counts as steps. */
  stepsPerMin?: number;
  /** Speed (km/h) → MET points, used when distance and time are both known. */
  speedMet?: Array<[number, number]>;
};

export const ACTIVITY_CATALOG: CatalogEntry[] = [
  {
    key: "running",
    label: "Running",
    met: [7.0, 9.0, 11.0],
    match: /\b(run|running|ran|jog|jogging|jogged|sprint|treadmill run|5k|10k|half marathon|marathon)\b/,
    stepsPerMin: 160,
    speedMet: [[6.4, 6.0], [8, 8.3], [9.7, 9.8], [10.8, 10.5], [11.3, 11.0], [12.9, 11.8], [14.5, 12.8], [16.1, 14.5], [17.7, 16.0]],
  },
  {
    key: "swimming",
    label: "Swimming",
    met: [4.5, 5.8, 9.8],
    match: /\b(swim|swam|swimming|swum|laps? in the pool|pool)\b/,
  },
  {
    key: "cycling",
    label: "Cycling",
    met: [4.0, 6.8, 10.0],
    match: /\b(cycl\w*|bik(e|ed|ing)|biking|bicycle|ride|rode)\b/,
    speedMet: [[12, 4.0], [16, 5.8], [17.5, 6.8], [20.5, 8.0], [23.5, 10.0], [27.5, 12.0], [32, 15.8]],
  },
  { key: "indoor_cycling", label: "Indoor cycling", met: [3.5, 6.8, 8.8], match: /\b(spin(ning)?( class)?|stationary bike|indoor cycl\w*|exercise bike|peloton)\b/ },
  { key: "walking", label: "Walking", met: [3.0, 3.5, 4.8], match: /\b(walk|walked|walking|stroll)\b/, stepsPerMin: 110 },
  { key: "hiking", label: "Hiking", met: [5.3, 6.0, 7.8], match: /\b(hik(e|ed|ing)|trek(king)?)\b/, stepsPerMin: 100 },
  { key: "football", label: "Football", met: [5.0, 7.0, 10.0], match: /\b(football|soccer|futsal)\b/ },
  { key: "cricket", label: "Cricket", met: [3.5, 4.8, 6.0], match: /\bcricket\b/ },
  { key: "badminton", label: "Badminton", met: [4.5, 5.5, 7.0], match: /\bbadminton\b/ },
  { key: "tennis", label: "Tennis", met: [5.0, 7.3, 8.0], match: /\btennis\b(?!.*table)/ },
  { key: "table_tennis", label: "Table tennis", met: [3.0, 4.0, 5.5], match: /\b(table tennis|ping ?pong|tt)\b/ },
  { key: "squash", label: "Squash", met: [7.3, 9.0, 12.0], match: /\bsquash\b/ },
  { key: "pickleball", label: "Pickleball", met: [4.0, 4.8, 6.0], match: /\bpickle ?ball\b/ },
  { key: "basketball", label: "Basketball", met: [4.5, 6.5, 8.0], match: /\b(basketball|hoops)\b/ },
  { key: "volleyball", label: "Volleyball", met: [3.0, 4.0, 6.0], match: /\bvolleyball\b/ },
  { key: "hockey", label: "Hockey", met: [6.0, 8.0, 10.0], match: /\bhockey\b/ },
  { key: "kabaddi", label: "Kabaddi", met: [6.0, 8.0, 10.0], match: /\bkabaddi\b/ },
  { key: "martial_arts", label: "Martial arts / boxing", met: [5.5, 7.8, 10.3], match: /\b(box(ing)?|kickbox\w*|martial arts?|karate|judo|taekwondo|mma|bjj|jiu.?jitsu|muay thai|sparring)\b/ },
  { key: "yoga", label: "Yoga", met: [2.5, 3.0, 4.0], match: /\b(yoga|asanas?|surya namaskar|sun salutations?)\b/ },
  { key: "pilates", label: "Pilates", met: [2.8, 3.0, 4.0], match: /\bpilates\b/ },
  { key: "dance", label: "Dance / Zumba", met: [4.5, 5.5, 7.3], match: /\b(danc\w*|zumba|bhangra|garba)\b/ },
  { key: "hiit", label: "HIIT / circuits", met: [5.0, 8.0, 10.0], match: /\b(hiit|circuits?|crossfit|bootcamp|tabata|burpees)\b/ },
  { key: "rowing", label: "Rowing", met: [4.8, 7.0, 8.5], match: /\b(row|rowing|rowed|erg|kayak\w*|canoe\w*)\b/ },
  { key: "elliptical", label: "Elliptical", met: [4.5, 5.0, 6.5], match: /\b(elliptical|cross.?trainer)\b/ },
  { key: "stairs", label: "Stair climbing", met: [4.0, 6.0, 8.8], match: /\b(stairs?|stair ?master|stepper|step mill)\b/ },
  { key: "skipping", label: "Skipping rope", met: [8.8, 11.8, 12.3], match: /\b(skipping|jump(ing)? rope|skip rope)\b/ },
  { key: "climbing", label: "Climbing", met: [5.0, 7.5, 8.0], match: /\b(climb(ing)?|boulder(ing)?)\b/ },
  { key: "skating", label: "Skating", met: [5.0, 7.0, 9.0], match: /\b(skat\w*|roller ?blad\w*)\b/ },
  { key: "strength", label: "Strength training", met: [3.5, 5.0, 6.0], match: /\b(strength|weight ?lift\w*|weights|gym|calisthenics|resistance)\b/ },
  { key: "other", label: "Other activity", met: [3.0, 5.0, 7.0], match: /$^/ },
];

const BY_KEY = new Map(ACTIVITY_CATALOG.map((c) => [c.key, c]));

export function catalogEntry(key: string): CatalogEntry {
  return BY_KEY.get(key) ?? BY_KEY.get("other")!;
}

/** Best catalog match for free text ("played football", "SWIMMING_POOL"); "other" when none fits. */
export function matchActivity(text: string): CatalogEntry {
  const t = text.toLowerCase().replace(/[_-]+/g, " ");
  // Specific sports before generic words ("table tennis" before "tennis", "spin class" before "bike").
  const order = ["table_tennis", "indoor_cycling", "walking", "hiking", "stairs"];
  for (const key of order) {
    const c = BY_KEY.get(key)!;
    if (c.match.test(t) && !(key === "walking" && /\b(run|jog|hik|trek)/.test(t))) return c;
  }
  for (const c of ACTIVITY_CATALOG) if (c.match.test(t)) return c;
  return BY_KEY.get("other")!;
}

/**
 * Health Connect exercise type → activity key. Walks are skipped: their burn already comes from
 * steps, and walk minutes are counted separately.
 */
export function healthConnectActivityKey(type: string): string | null {
  const t = type.toLowerCase().replace(/^exercise_type_/, "").replace(/[_-]+/g, " ");
  if (/\bwalk/.test(t)) return null;
  if (/\b(weight|strength|calisthenics)\b/.test(t)) return "strength";
  if (/\b(biking|cycling)\b/.test(t)) return /stationary/.test(t) ? "indoor_cycling" : "cycling";
  if (/high intensity|hiit|interval|boot ?camp/.test(t)) return "hiit";
  return matchActivity(t).key;
}

const intensityIndex = (i: Intensity): number => INTENSITIES.indexOf(i);

function interpolate(points: Array<[number, number]>, x: number): number {
  if (x <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1]![1];
}

/** MET for this session: from speed when distance and time are known, else from intensity. */
export function metFor(key: string, intensity: Intensity, minutes: number, distanceM?: number | null): number {
  const c = catalogEntry(key);
  if (c.speedMet && distanceM && distanceM > 0 && minutes > 0) {
    const kmh = distanceM / 1000 / (minutes / 60);
    if (kmh > 2 && kmh < 60) return Math.round(interpolate(c.speedMet, kmh) * 10) / 10;
  }
  return c.met[intensityIndex(intensity)] ?? c.met[1];
}

/** Active kcal above resting: (MET − 1) × kg × hours. */
export function estimateActivityKcal(input: {
  key: string;
  intensity: Intensity;
  minutes: number;
  weightKg: number;
  distanceM?: number | null;
}): { kcal: number; met: number } {
  const met = metFor(input.key, input.intensity, input.minutes, input.distanceM);
  const kcal = Math.max(0, Math.round((met - 1) * input.weightKg * (input.minutes / 60)));
  return { kcal, met };
}

// ---------- the day's burn ----------

/** Roughly 0.5 kcal per kg of body weight per 1,000 steps (≈0.04 kcal a step at 80 kg). */
export function stepsBurn(steps: number, weightKg: number): number {
  return Math.round(steps * weightKg * 0.0005);
}

/** Resistance training at ~5 METs: kcal/min = MET × 3.5 × kg / 200. */
export function workoutBurn(minutes: number, weightKg: number): number {
  return Math.round((minutes * 5 * 3.5 * weightKg) / 200);
}

export type ActivitySource = "chat" | "quick_add" | "health_connect";
export type KcalSource = "device" | "user" | "estimate";

export type Activity = {
  id: string;
  localDate: string;
  /** ISO; null when the person didn't say when. */
  startTime: string | null;
  durationMin: number;
  key: string;
  label: string;
  intensity: Intensity;
  distanceM: number | null;
  kcal: number;
  kcalSource: KcalSource;
  source: ActivitySource;
  /** Set when a Health Connect session already covers this one. */
  duplicateOf: string | null;
};

export type StepBucket = { startTime: string; endTime: string; count: number };
export type TimedWorkout = { startTime: string; durationMin: number | null };

const ms = (iso: string): number => Date.parse(iso);
const endOf = (a: { startTime: string | null; durationMin: number }): number | null =>
  a.startTime ? ms(a.startTime) + a.durationMin * 60_000 : null;

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Steps the phone counted during the activity. With a start time, the step buckets inside the
 * window (pro rata at the edges). Without one, only for activities that are mostly steps
 * (running, walking, hiking): their expected step rate, capped at what's left of the day's steps.
 */
export function stepsDuring(a: Activity, buckets: StepBucket[], stepsLeft: number): number {
  const start = a.startTime ? ms(a.startTime) : null;
  const end = endOf(a);
  if (start !== null && end !== null && buckets.length) {
    let inside = 0;
    for (const b of buckets) {
      const bs = ms(b.startTime);
      const be = Math.max(ms(b.endTime), bs + 1);
      const from = Math.max(bs, start);
      const to = Math.min(be, end);
      if (to > from) inside += (b.count * (to - from)) / (be - bs);
    }
    return Math.min(stepsLeft, Math.round(inside));
  }
  const rate = catalogEntry(a.key).stepsPerMin;
  return rate ? Math.min(stepsLeft, Math.round(rate * a.durationMin)) : 0;
}

/** Why an activity isn't added to the day's burn; null when it is. */
export type NotCounted = "duplicate_health_connect" | "duplicate_hevy" | null;

/** A Health Connect strength session at the same time as a Hevy workout is the same workout. */
export function hevyDuplicate(a: Activity, workouts: TimedWorkout[]): boolean {
  if (a.key !== "strength" || a.source !== "health_connect") return false;
  const start = a.startTime ? ms(a.startTime) : null;
  const end = endOf(a);
  return workouts.some((w) => {
    if (start === null || end === null) return true;
    const ws = ms(w.startTime);
    return overlaps(start, end, ws, ws + (w.durationMin ?? 60) * 60_000);
  });
}

export type BurnLine = { id: string; label: string; kcal: number; counted: boolean; why: NotCounted };

export type Burn = {
  kcal: number;
  /** health_connect: the phone's active calories (+ activities it didn't see). estimate: from steps, workouts and activities. */
  source: "health_connect" | "estimate";
  stepsKcal: number;
  workoutKcal: number;
  activityKcal: number;
  activities: BurnLine[];
};

/**
 * Total active burn for one day, with nothing counted twice:
 * - steps taken during an activity come off the steps estimate (the activity's own number covers them);
 * - a Health Connect strength session at the time of a Hevy workout is the Hevy workout;
 * - a manual activity that a Health Connect session already covers is left out;
 * - with the phone's active calories, Health Connect sessions are already inside that number, so only
 *   activities the phone didn't see are added (less the steps it did see during them).
 */
export function burnForDay(input: {
  activeKcal: number | null;
  steps: number;
  workouts: TimedWorkout[];
  activities: Activity[];
  stepBuckets?: StepBucket[];
  weightKg: number;
}): Burn | null {
  const kg = input.weightKg;
  let stepsLeft = input.steps;
  const lines: BurnLine[] = [];
  const counted: Array<{ a: Activity; stepsInside: number }> = [];
  for (const a of input.activities) {
    const why: NotCounted = a.duplicateOf ? "duplicate_health_connect" : hevyDuplicate(a, input.workouts) ? "duplicate_hevy" : null;
    lines.push({ id: a.id, label: a.label, kcal: a.kcal, counted: why === null, why });
    if (why) continue;
    const inside = stepsDuring(a, input.stepBuckets ?? [], stepsLeft);
    stepsLeft -= inside;
    counted.push({ a, stepsInside: inside });
  }

  const workoutMinutes = input.workouts.reduce((t, w) => t + (w.durationMin ?? 0), 0);
  const workoutKcal = workoutBurn(workoutMinutes, kg);
  const stepsKcal = stepsBurn(stepsLeft, kg);

  if (input.activeKcal != null && input.activeKcal > 0) {
    // The phone's number already includes what it recorded; add what it couldn't have seen.
    const extra = counted
      .filter(({ a }) => a.source !== "health_connect")
      .reduce((t, { a, stepsInside }) => t + Math.max(0, a.kcal - stepsBurn(stepsInside, kg)), 0);
    return {
      kcal: Math.round(input.activeKcal + extra),
      source: "health_connect",
      stepsKcal,
      workoutKcal,
      activityKcal: extra,
      activities: lines,
    };
  }
  const activityKcal = counted.reduce((t, { a }) => t + a.kcal, 0);
  if (!stepsKcal && !workoutKcal && !activityKcal) return lines.length ? { kcal: 0, source: "estimate", stepsKcal, workoutKcal, activityKcal, activities: lines } : null;
  return { kcal: stepsKcal + workoutKcal + activityKcal, source: "estimate", stepsKcal, workoutKcal, activityKcal, activities: lines };
}

// ---------- duplicates on entry ----------

/**
 * A Health Connect session that is the same as the one being logged: same activity, and the times
 * overlap, or one side has no time and it's the same day.
 */
export function findHealthConnectMatch(
  candidate: { localDate: string; key: string; startTime: string | null; durationMin: number },
  existing: Activity[],
): Activity | null {
  const cs = candidate.startTime ? ms(candidate.startTime) : null;
  const ce = endOf(candidate);
  for (const e of existing) {
    if (e.source !== "health_connect" || e.localDate !== candidate.localDate) continue;
    if (e.key !== candidate.key && !(sameFamily(e.key, candidate.key))) continue;
    const es = e.startTime ? ms(e.startTime) : null;
    const ee = endOf(e);
    if (cs === null || es === null || ce === null || ee === null) return e;
    if (overlaps(cs, ce, es, ee)) return e;
  }
  return null;
}

function sameFamily(a: string, b: string): boolean {
  const family = (k: string) => (k === "indoor_cycling" ? "cycling" : k === "hiking" ? "walking" : k);
  return family(a) === family(b);
}

// ---------- training-day rules ----------

/** A sport replaces the gym only when it burns at least this share of a usual gym session. */
export const TRAINING_BURN_SHARE = 0.8;
/** Strength sessions a week the plan needs, whatever else they do (capped at their training days). */
export const MIN_LIFTING_DAYS = 3;
/** Without Hevy history, a usual gym session is taken as an hour. */
const DEFAULT_GYM_MINUTES = 60;

/**
 * What a usual training day burns: the median of their recent Hevy sessions, or an hour of lifting
 * when there's no history.
 */
export function typicalTrainingBurn(workoutMinutes: number[], weightKg: number): number {
  const mins = workoutMinutes.filter((m) => m > 0).sort((a, b) => a - b);
  const median = mins.length ? mins[Math.floor((mins.length - 1) / 2)]! : DEFAULT_GYM_MINUTES;
  return workoutBurn(median, weightKg);
}

/** The activity (not a duplicate) that counts as the day's training, if any. */
export function trainingActivity(
  activities: Activity[],
  workouts: TimedWorkout[],
  typicalBurn: number,
): Activity | null {
  const threshold = Math.round(typicalBurn * TRAINING_BURN_SHARE);
  const ok = activities.filter((a) => !a.duplicateOf && !hevyDuplicate(a, workouts) && a.key !== "walking");
  // A strength session from the watch is a workout whatever it burned.
  const best = ok.find((a) => a.key === "strength") ?? [...ok].sort((x, y) => y.kcal - x.kcal)[0];
  if (!best) return null;
  return best.key === "strength" || best.kcal >= threshold ? best : null;
}

/** Monday of the week containing `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/**
 * When a sport stands in for a training day, what it means for the week's strength minimum
 * (MIN_LIFTING_DAYS, capped at their training days). Lifting so far this week plus the training
 * days still ahead is the most the week can reach. Always returns a line for the coach to post, so
 * the person sees the trade-off: a reminder when the week can still make it, a warning when it can't.
 */
export function liftingNote(input: {
  date: string;
  trainingDays: number[];
  /** Dates with a Hevy workout (or "trained, didn't log"). */
  liftingDates: string[];
  activityLabel: string;
}): { text: string; short: boolean } | null {
  const need = Math.min(MIN_LIFTING_DAYS, input.trainingDays.length);
  if (need === 0) return null;
  const monday = mondayOf(input.date);
  const day = (i: number) => new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
  const week = Array.from({ length: 7 }, (_, i) => day(i));
  const lifted = new Set(input.liftingDates.filter((d) => week.includes(d)));
  const ahead = week.filter((d) => d > input.date && !lifted.has(d) && input.trainingDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())).length;
  const most = lifted.size + ahead;
  const n = (k: number) => `${k} strength session${k === 1 ? "" : "s"}`;
  const head = `${input.activityLabel} counts as today's training.`;
  if (most >= need) {
    const still = need - lifted.size;
    if (still <= 0) return { text: `${head} You've already done ${n(lifted.size)} this week, so the plan's minimum of ${need} is covered.`, short: false };
    return {
      text: `${head} Your plan needs ${n(need)} a week: you've done ${lifted.size}, so keep ${still} of your ${ahead} remaining training day${ahead === 1 ? "" : "s"} for lifting.`,
      short: false,
    };
  }
  return {
    text: `${head} Heads up, this affects your plan: it needs ${n(need)} a week, and this week can now reach at most ${most}. Lifting is what holds on to muscle, especially in a calorie deficit, so ${ahead ? "make the remaining training days gym days" : "aim to get back to the gym next week"}.`,
    short: true,
  };
}
