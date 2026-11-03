const ROUTINE_ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

export type ParsedHevyWrite =
  | { kind: "routine"; text: string }
  | { kind: "routine_update"; routineId: string; text: string }
  | { kind: "workout"; text: string }
  | { kind: "none" };

/**
 * Explicit Hevy write commands (avoids hijacking normal fitness chat).
 * - `hevy routine: …` — create routine
 * - `hevy routine update: <uuid> — …` — replace routine (PUT); uuid then em dash, colon, or hyphen + space then plan
 * - `hevy workout: …` — log workout
 * - `/hevy routine: …` when `slashCommandKey === "hevy"` (payload only in `rawMessage`).
 */
export function parseHevyWriteCommand(
  rawMessage: string,
  slashCommandKey?: string,
): ParsedHevyWrite {
  const t = rawMessage.trim();

  if (slashCommandKey === "hevy") {
    const updSlash = t.match(
      new RegExp(`^routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s*[-\\u2014\\u2013:]\\s*(.+)$`, "is"),
    );
    if (updSlash?.[1] && updSlash[2]?.trim()) {
      return { kind: "routine_update", routineId: updSlash[1]!, text: updSlash[2]!.trim() };
    }
    const updSlashSp = t.match(
      new RegExp(`^routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s+(.+)$`, "is"),
    );
    if (updSlashSp?.[1] && updSlashSp[2]?.trim()) {
      return { kind: "routine_update", routineId: updSlashSp[1]!, text: updSlashSp[2]!.trim() };
    }
    const slashM = t.match(/^(routine|workout)\s*:\s*(.+)$/is);
    if (slashM?.[2]?.trim()) {
      const kind = slashM[1]!.toLowerCase() as "routine" | "workout";
      return { kind, text: slashM[2]!.trim() };
    }
  }

  const upd = t.match(
    new RegExp(
      `^hevy\\s+routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s*[-\\u2014\\u2013:]\\s*(.+)$`,
      "is",
    ),
  );
  if (upd?.[1] && upd[2]?.trim()) {
    return { kind: "routine_update", routineId: upd[1]!, text: upd[2]!.trim() };
  }
  const updSp = t.match(new RegExp(`^hevy\\s+routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s+(.+)$`, "is"));
  if (updSp?.[1] && updSp[2]?.trim()) {
    return { kind: "routine_update", routineId: updSp[1]!, text: updSp[2]!.trim() };
  }

  const wM = t.match(/^hevy\s+workout\s*:\s*(.+)$/i);
  if (wM?.[1]?.trim()) {
    return { kind: "workout", text: wM[1]!.trim() };
  }

  const rM = t.match(/^hevy\s+routine\s*:\s*(.+)$/i);
  if (rM?.[1]?.trim()) {
    return { kind: "routine", text: rM[1]!.trim() };
  }

  return { kind: "none" };
}

export function isHevyWriteCommand(rawMessage: string, slashCommandKey?: string): boolean {
  return parseHevyWriteCommand(rawMessage, slashCommandKey).kind !== "none";
}

const ROUTINE_NOUN = /\b(?:routine|routines|programme?|split|template)\b/i;
const WORKOUT_NOUN = /\b(?:workout|workouts|session|sessions|training|lift|gym)\b/i;
const CREATE_VERBS =
  /\b(?:create|creating|make|making|build|building|set\s?up|generate|design|draft|new|add|save|push|sync|put)\b/i;
const LOG_VERBS =
  /\b(?:log|logging|record|recording|logged|recorded|track|did|done|completed|finished)\b/i;
const UPDATE_VERBS = /\b(?:update|replace|modify|change|edit|swap|revise|rework)\b/i;
const READ_ONLY_VERBS =
  /\b(?:review|how was|what did|what was|show|see|list|check|compare|analyse|analyze|summari[sz]e|suggest|recommend|should i)\b/i;

/**
 * Hevy write intent from natural language, for when the router has already decided this
 * turn is a Hevy write. Nobody says "hevy routine:" out loud — they say "create a routine
 * and add it to Hevy" — and refusing that made Magnus deny a capability it has.
 *
 * Returns `none` when the message reads as a question or a read, so a mis-route can fall
 * back to coaching instead of writing something the user did not ask for.
 */
export function inferHevyWriteIntent(
  rawMessage: string,
  slashCommandKey?: string,
): ParsedHevyWrite {
  const prefixed = parseHevyWriteCommand(rawMessage, slashCommandKey);
  if (prefixed.kind !== "none") {
    return prefixed;
  }

  const t = rawMessage.trim();
  if (!t) {
    return { kind: "none" };
  }

  const mentionsRoutine = ROUTINE_NOUN.test(t);
  const mentionsWorkout = WORKOUT_NOUN.test(t);
  const mentionsHevy = /\bhevy\b/i.test(t);
  if (!mentionsRoutine && !mentionsWorkout && !mentionsHevy) {
    return { kind: "none" };
  }

  const uuid = t.match(new RegExp(ROUTINE_ID, "i"));
  if (uuid?.[1] && UPDATE_VERBS.test(t)) {
    return { kind: "routine_update", routineId: uuid[1], text: t };
  }

  const wantsWrite = CREATE_VERBS.test(t) || LOG_VERBS.test(t) || UPDATE_VERBS.test(t);
  if (!wantsWrite) {
    return { kind: "none" };
  }
  // "review my last workout" and "what should I do today" stay reads.
  if (READ_ONLY_VERBS.test(t) && !CREATE_VERBS.test(t) && !UPDATE_VERBS.test(t)) {
    return { kind: "none" };
  }

  if (mentionsRoutine) {
    return { kind: "routine", text: t };
  }
  if (LOG_VERBS.test(t)) {
    return { kind: "workout", text: t };
  }
  if (mentionsWorkout && CREATE_VERBS.test(t)) {
    return { kind: "workout", text: t };
  }
  return { kind: "none" };
}
