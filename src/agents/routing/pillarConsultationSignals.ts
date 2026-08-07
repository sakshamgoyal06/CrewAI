/**
 * Detect when a GENERAL turn should consult one or more pillar specialists — from message or recent context.
 */
import type { Intent } from "../../intent.js";
import type { RoutingChatTurn } from "./magnusToolContinuation.js";

const PILLAR_INTENTS = ["HEALTH", "WEALTH", "HAPPINESS", "WISDOM"] as const;
export type ConsultablePillarIntent = (typeof PILLAR_INTENTS)[number];

// --- HEALTH ---

const FITNESS_SIGNAL_RE =
  /\b(hevy|workouts?|work\s*out|gym|training|exercise|pull\s+[ab]\b|push\s+[ab]\b|legs|cardio|bench|squat|deadlift|treadmill|sets?|reps?|\bpr\b|hypertrophy|strength)\b/i;

const HEALTH_BODY_SIGNAL_RE =
  /\b(meal|macro|sleep|recovery|nutrition|protein|calorie|fatigue|hrv|energy level|body\s*weight)\b/i;

const GYM_SESSION_RE =
  /\b(?:gym|workout|training)\s+session\b|\bhow\s+was\s+(?:my\s+)?(?:today'?s?\s+)?(?:gym|workout|training)\b/i;

const HEVY_READ_RE =
  /\b(?:pull|read|fetch|get|show)\b.{0,30}\b(?:hevy|workout\s+data)\b|\bhevy\b.{0,30}\b(?:data|session|workout|history)\b|\bread\s+hevy\b/i;

const FITNESS_REVIEW_RE =
  /\b(?:review|recap|breakdown|summarize|summary)\b.{0,50}\b(?:workout|gym|hevy|push|pull|legs|session)\b/i;

// --- WEALTH ---

const WEALTH_SIGNAL_RE =
  /\b(budget|budgeting|spending|savings?|debt|net\s*worth|invest(?:ing|ment)?|portfolio|holdings?|sip|sips|mutual\s+fund|equity|equities|cash\s*flow|financial|money|zerodha|kite|coin\s*mf|stocks?|shares?|emergency\s+fund|fire\b|allocation)\b/i;

const WEALTH_READ_RE =
  /\b(?:pull|read|fetch|get|show|what(?:'s| is))\b.{0,40}\b(?:portfolio|holdings|kite|zerodha|sip|net\s*worth)\b|\b(?:portfolio|holdings|kite|zerodha)\b.{0,30}\b(?:data|status|summary)\b/i;

// --- HAPPINESS ---

const HAPPINESS_SIGNAL_RE =
  /\b(book|books|film|films|movie|movies|poetry|game|games|hobby|hobbies|travel|trip|vacation|holiday|friend|friends|family|relationship|rest|leisure|creative|joy|weekend\s+plan|what\s+to\s+(?:read|watch|play))\b/i;

// --- WISDOM ---

const WISDOM_SIGNAL_RE =
  /\b(learn(?:ing)?|course|courses|skill|skills|career|promotion|practice|studying|study|ship(?:ping)?|project|projects|milestone|curriculum|craft|growth|upskill|resume|cv|interview)\b/i;

const DELEGATED_AGENT_BY_INTENT: Record<ConsultablePillarIntent, string[]> = {
  HEALTH: ["HealthComposite", "HealthOnboarding"],
  WEALTH: ["Wealth"],
  HAPPINESS: ["Happiness"],
  WISDOM: ["Wisdom"],
};

function turnHasPillarMetadata(intent: ConsultablePillarIntent, turn: RoutingChatTurn): boolean {
  const meta = turn.metadata;
  if (!meta || typeof meta !== "object") {
    return false;
  }
  const delegated = meta.delegated_agent;
  if (typeof delegated === "string" && DELEGATED_AGENT_BY_INTENT[intent].includes(delegated)) {
    return true;
  }
  const agentMeta = meta.agent_metadata;
  if (agentMeta && typeof agentMeta === "object") {
    const am = agentMeta as Record<string, unknown>;
    const department = String(am.department ?? "").toUpperCase();
    const pillar = String(am.pillar ?? "").toLowerCase();
    if (intent === "HEALTH" && (department === "HEALTH" || pillar === "health")) {
      return true;
    }
    if (intent === "WEALTH" && (department.includes("WEALTH") || pillar === "wealth")) {
      return true;
    }
    if (intent === "HAPPINESS" && (pillar === "joy" || am.specialist === "Happiness")) {
      return true;
    }
    if (intent === "WISDOM" && (pillar === "wisdom" || am.specialist === "Wisdom")) {
      return true;
    }
    if (intent === "HEALTH" && (am.workout_source === "hevy" || am.health_order)) {
      return true;
    }
    if (intent === "WEALTH" && (am.kite === "loaded" || am.kite_connect === true)) {
      return true;
    }
  }
  if (intent === "HEALTH" && meta.proactive_kind === "gym_hevy_reconcile") {
    return true;
  }
  return false;
}

export function messageHasPillarSignal(intent: ConsultablePillarIntent, message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  switch (intent) {
    case "HEALTH":
      return (
        FITNESS_SIGNAL_RE.test(text) ||
        HEALTH_BODY_SIGNAL_RE.test(text) ||
        GYM_SESSION_RE.test(text) ||
        HEVY_READ_RE.test(text) ||
        FITNESS_REVIEW_RE.test(text)
      );
    case "WEALTH":
      return WEALTH_SIGNAL_RE.test(text) || WEALTH_READ_RE.test(text);
    case "HAPPINESS":
      return HAPPINESS_SIGNAL_RE.test(text);
    case "WISDOM":
      return WISDOM_SIGNAL_RE.test(text);
    default:
      return false;
  }
}

export function recentTurnsHavePillarSignal(
  intent: ConsultablePillarIntent,
  turns: RoutingChatTurn[],
): boolean {
  for (const turn of turns.slice(-6)) {
    if (messageHasPillarSignal(intent, turn.content)) {
      return true;
    }
    if (turnHasPillarMetadata(intent, turn)) {
      return true;
    }
  }
  return false;
}

/** Pillar specialists Magnus should run in parallel on a GENERAL turn. */
export function resolvePillarsToConsultOnGeneral(input: {
  userMessage: string;
  recentTurns: RoutingChatTurn[];
}): ConsultablePillarIntent[] {
  const out: ConsultablePillarIntent[] = [];
  for (const intent of PILLAR_INTENTS) {
    if (
      messageHasPillarSignal(intent, input.userMessage) ||
      recentTurnsHavePillarSignal(intent, input.recentTurns)
    ) {
      out.push(intent);
    }
  }
  return out;
}

/** @deprecated Use messageHasPillarSignal("HEALTH", message) */
export function messageHasHealthSignal(message: string): boolean {
  return messageHasPillarSignal("HEALTH", message);
}

/** @deprecated Use recentTurnsHavePillarSignal("HEALTH", turns) */
export function recentTurnsHaveHealthSignal(turns: RoutingChatTurn[]): boolean {
  return recentTurnsHavePillarSignal("HEALTH", turns);
}

/** @deprecated Use resolvePillarsToConsultOnGeneral(...).includes("HEALTH") */
export function shouldConsultHealthOnGeneral(input: {
  userMessage: string;
  recentTurns: RoutingChatTurn[];
}): boolean {
  return resolvePillarsToConsultOnGeneral(input).includes("HEALTH");
}

/**
 * Fitness / Hevy read turns that should route to HEALTH outright (not Magnus-only).
 * Combined Magnus tool actions (check-in log + Hevy review) stay GENERAL + consultation.
 */
export function looksLikeHealthFitnessIntent(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  if (WEALTH_READ_RE.test(text)) {
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

/** Portfolio / Kite reads → WEALTH outright when not a Magnus-only tool action. */
export function looksLikeWealthPortfolioIntent(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }
  return WEALTH_READ_RE.test(text);
}

export function looksLikeDirectPillarIntent(intent: Intent, message: string): boolean {
  switch (intent) {
    case "HEALTH":
      return looksLikeHealthFitnessIntent(message);
    case "WEALTH":
      return looksLikeWealthPortfolioIntent(message);
    default:
      return false;
  }
}
