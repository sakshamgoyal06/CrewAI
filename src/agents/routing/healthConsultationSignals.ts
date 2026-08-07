/**
 * Detect when a GENERAL turn should still consult Health — message text or recent chat context.
 */
import type { RoutingChatTurn } from "./magnusToolContinuation.js";

const FITNESS_SIGNAL_RE =
  /\b(hevy|workouts?|work\s*out|gym|training|exercise|pull\s*[ab]?|push\s*[ab]?|legs|cardio|bench|squat|deadlift|treadmill|sets?|reps?|\bpr\b|hypertrophy|strength)\b/i;

const HEALTH_BODY_SIGNAL_RE =
  /\b(meal|macro|sleep|recovery|nutrition|protein|calorie|fatigue|hrv|energy level|body\s*weight)\b/i;

const GYM_SESSION_RE =
  /\b(?:gym|workout|training)\s+session\b|\bhow\s+was\s+(?:my\s+)?(?:today'?s?\s+)?(?:gym|workout|training)\b/i;

const HEVY_READ_RE =
  /\b(?:pull|read|fetch|get|show)\b.{0,30}\b(?:hevy|workout\s+data)\b|\bhevy\b.{0,30}\b(?:data|session|workout|history)\b|\bread\s+hevy\b/i;

const FITNESS_REVIEW_RE =
  /\b(?:review|recap|breakdown|summarize|summary)\b.{0,50}\b(?:workout|gym|hevy|push|pull|legs|session)\b/i;

function turnHasHealthMetadata(turn: RoutingChatTurn): boolean {
  const meta = turn.metadata;
  if (!meta || typeof meta !== "object") {
    return false;
  }
  if (meta.delegated_agent === "HealthComposite" || meta.delegated_agent === "HealthOnboarding") {
    return true;
  }
  const agentMeta = meta.agent_metadata;
  if (agentMeta && typeof agentMeta === "object") {
    const am = agentMeta as Record<string, unknown>;
    if (am.department === "HEALTH" || am.pillar === "health") {
      return true;
    }
    if (am.workout_source === "hevy" || am.health_order) {
      return true;
    }
  }
  if (meta.proactive_kind === "gym_hevy_reconcile") {
    return true;
  }
  return false;
}

export function messageHasHealthSignal(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  return (
    FITNESS_SIGNAL_RE.test(text) ||
    HEALTH_BODY_SIGNAL_RE.test(text) ||
    GYM_SESSION_RE.test(text) ||
    HEVY_READ_RE.test(text) ||
    FITNESS_REVIEW_RE.test(text)
  );
}

export function recentTurnsHaveHealthSignal(turns: RoutingChatTurn[]): boolean {
  for (const turn of turns.slice(-6)) {
    if (messageHasHealthSignal(turn.content)) {
      return true;
    }
    if (turnHasHealthMetadata(turn)) {
      return true;
    }
  }
  return false;
}

/** True when Magnus (GENERAL) should still run Health in parallel. */
export function shouldConsultHealthOnGeneral(input: {
  userMessage: string;
  recentTurns: RoutingChatTurn[];
}): boolean {
  return (
    messageHasHealthSignal(input.userMessage) || recentTurnsHaveHealthSignal(input.recentTurns)
  );
}

/**
 * Fitness / Hevy read turns that should route to HEALTH outright (not Magnus-only).
 * Excludes combined Magnus tool actions (e.g. check-in log + Hevy review) — those use consultation.
 */
export function looksLikeHealthFitnessIntent(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  if (HEVY_READ_RE.test(text) || GYM_SESSION_RE.test(text) || FITNESS_REVIEW_RE.test(text)) {
    return true;
  }
  if (FITNESS_SIGNAL_RE.test(text) && /\b(?:how|what|review|recap|pull|read|show|compare)\b/i.test(text)) {
    return true;
  }
  return false;
}
