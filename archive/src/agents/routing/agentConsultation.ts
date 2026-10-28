/**
 * Multi-agent consultation: Magnus coordinates, relevant pillars advise, reconciler picks the reply.
 */
import type { AgentResult } from "../types.js";
import { hasSuccessfulWriteTool } from "./actionIntegrity.js";
import {
  buildConsultationOutcomeSummary,
  formatConsultationOutcomeForCompose,
  magnusTextForConsultationMerge,
  slimConsultationOutcomeForMeta,
  type ConsultationReconcileInput,
  type PillarConsultationCandidate,
} from "./consultationOutcome.js";
import {
  messageHasPillarSignal,
  type ConsultablePillarIntent,
} from "./pillarConsultationSignals.js";

export type { ConsultationReconcileInput, PillarConsultationCandidate } from "./consultationOutcome.js";

export type ConsultedSource = "magnus" | ConsultablePillarIntent;

export type ConsultationReconcileOutcome = {
  text: string;
  metadata: Record<string, unknown>;
  primarySource: ConsultedSource;
  delegatedAgent?: string;
  consulted: ConsultedSource[];
  reason: string;
};

const MAGNUS_DENIES_HEVY_RE =
  /\b(?:don'?t|do not|cannot|can'?t|unable to)\b.{0,60}\b(?:hevy|workout data|sets?|reps?|weights?)\b|\bno (?:direct )?hevy\b|\bnot connected\b.{0,30}\bhevy\b/i;

const MAGNUS_DENIES_KITE_RE =
  /\b(?:don'?t|do not|cannot|can'?t|unable to)\b.{0,60}\b(?:kite|zerodha|portfolio|holdings?)\b|\bno (?:direct )?(?:kite|zerodha|portfolio)\b/i;

type ScoredCandidate = {
  source: ConsultedSource;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
  agentName?: string;
  reason: string;
};

function healthLoadedHevy(meta: Record<string, unknown>): boolean {
  return meta.workout_source === "hevy" && meta.workout_data === "loaded";
}

function healthIsSubstantive(meta: Record<string, unknown>): boolean {
  if (meta.genericAck === true) {
    return false;
  }
  if (healthLoadedHevy(meta)) {
    return true;
  }
  if (meta.meal_log === true || meta.journal_saved === true || meta.hevy_write === true) {
    return true;
  }
  if (typeof meta.health_order === "string" && meta.health_order !== "fallback") {
    return true;
  }
  return false;
}

function wealthIsSubstantive(meta: Record<string, unknown>): boolean {
  if (meta.kite_connect === true) {
    return true;
  }
  if (meta.kite === "loaded") {
    return true;
  }
  return false;
}

function promptPillarIsSubstantive(result: AgentResult): boolean {
  const text = result.text.trim();
  return text.length > 24 && text !== "…";
}

function pillarIsSubstantive(intent: ConsultablePillarIntent, result: AgentResult): boolean {
  const meta = result.metadata ?? {};
  switch (intent) {
    case "HEALTH":
      return healthIsSubstantive(meta);
    case "WEALTH":
      return wealthIsSubstantive(meta) || promptPillarIsSubstantive(result);
    case "HAPPINESS":
    case "WISDOM":
      return promptPillarIsSubstantive(result);
    default:
      return false;
  }
}

function magnusDeniedPillarCapability(
  intent: ConsultablePillarIntent,
  magnusText: string,
  meta: Record<string, unknown>,
): boolean {
  if (intent === "HEALTH" && healthLoadedHevy(meta)) {
    return MAGNUS_DENIES_HEVY_RE.test(magnusText);
  }
  if (intent === "WEALTH" && meta.kite === "loaded") {
    return MAGNUS_DENIES_KITE_RE.test(magnusText);
  }
  return false;
}

function mergeTexts(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join("\n\n");
}

function scorePillarCandidate(
  input: ConsultationReconcileInput,
  candidate: PillarConsultationCandidate,
): ScoredCandidate | null {
  const meta = candidate.result.metadata ?? {};
  if (!pillarIsSubstantive(candidate.intent, candidate.result)) {
    return null;
  }

  let score = 5;
  let reason = "pillar_substantive";

  if (messageHasPillarSignal(input.userMessage, candidate.intent, input.routingContext)) {
    score += 10;
    reason = "message_pillar_signal";
  }

  if (candidate.intent === "HEALTH" && healthLoadedHevy(meta)) {
    score += 20;
    reason = "health_hevy_loaded";
  }
  if (candidate.intent === "WEALTH" && meta.kite === "loaded") {
    score += 20;
    reason = "wealth_kite_loaded";
  }

  if (magnusDeniedPillarCapability(candidate.intent, input.magnus.text, meta)) {
    score += 30;
    reason = `magnus_denied_${candidate.intent.toLowerCase()}_capability`;
  }

  return {
    source: candidate.intent,
    score,
    text: candidate.result.text,
    metadata: meta,
    agentName: candidate.agentName,
    reason,
  };
}

const AGENT_NAME_BY_INTENT: Record<ConsultablePillarIntent, string> = {
  HEALTH: "HealthComposite",
  WEALTH: "Wealth",
  HAPPINESS: "Happiness",
  WISDOM: "Wisdom",
};

/**
 * Pick the user-facing reply when Magnus and one or more pillars ran on a GENERAL turn.
 */
export function reconcileConsultationOutputs(
  input: ConsultationReconcileInput,
): ConsultationReconcileOutcome {
  const outcomeSummary = buildConsultationOutcomeSummary(input);
  const composeContext = formatConsultationOutcomeForCompose(outcomeSummary);
  const slimOutcome = slimConsultationOutcomeForMeta(outcomeSummary);
  const consulted: ConsultedSource[] = ["magnus"];
  const magnusMeta = input.magnus.metadata ?? {};
  const magnusWrote = hasSuccessfulWriteTool(magnusMeta);

  const scored = input.pillars
    .map((p) => scorePillarCandidate(input, p))
    .filter((s): s is ScoredCandidate => s !== null)
    .sort((a, b) => b.score - a.score);

  for (const s of scored) {
    if (!consulted.includes(s.source)) {
      consulted.push(s.source);
    }
  }

  if (scored.length === 0) {
    return {
      text: input.magnus.text,
      metadata: {
        ...magnusMeta,
        consultation: {
          consulted,
          primary: "magnus",
          reason: "no_substantive_pillar",
        },
      },
      primarySource: "magnus",
      consulted,
      reason: "no_substantive_pillar",
    };
  }

  const top = scored[0]!;
  const runnerUp = scored[1];
  const topIntent = top.source as ConsultablePillarIntent;

  const healthCandidate = input.pillars.find((p) => p.intent === "HEALTH");
  const healthMeta = healthCandidate?.result.metadata ?? {};
  const hevyLoaded = healthLoadedHevy(healthMeta);
  const fitnessTurn = healthMeta.health_order === "fitness";

  if (magnusWrote && hevyLoaded && fitnessTurn && healthCandidate) {
    const magnusSlice = magnusTextForConsultationMerge(
      input.magnus.text,
      magnusMeta,
      outcomeSummary,
    );
    return {
      text: mergeTexts([healthCandidate.result.text, magnusSlice]),
      metadata: {
        ...healthMeta,
        ...magnusMeta,
        specialist: healthMeta.specialist ?? "Fitness",
        consultation_outcome: slimOutcome,
        consultation_compose_context: composeContext,
        consultation: {
          consulted,
          primary: "HEALTH",
          reason: "merged_hevy_review_and_magnus_write",
        },
      },
      primarySource: "HEALTH",
      delegatedAgent: healthCandidate.agentName,
      consulted,
      reason: "merged_hevy_review_and_magnus_write",
    };
  }

  if (magnusWrote && top.score < 25) {
    return {
      text: input.magnus.text,
      metadata: {
        ...magnusMeta,
        consultation: {
          consulted,
          primary: "magnus",
          reason: "magnus_successful_write",
          pillar_alternate: top.text.slice(0, 500),
        },
      },
      primarySource: "magnus",
      consulted,
      reason: "magnus_successful_write",
    };
  }

  if (runnerUp && runnerUp.score >= 10 && top.score - runnerUp.score <= 5) {
    const merged = mergeTexts([top.text, runnerUp.text]);
    return {
      text: merged,
      metadata: {
        ...top.metadata,
        ...runnerUp.metadata,
        consultation: {
          consulted,
          primary: top.source,
          reason: "merged_multi_pillar",
          secondary: runnerUp.source,
        },
      },
      primarySource: top.source,
      delegatedAgent: top.agentName ?? AGENT_NAME_BY_INTENT[topIntent],
      consulted,
      reason: "merged_multi_pillar",
    };
  }

  return {
    text: top.text,
    metadata: {
      ...top.metadata,
      consultation_outcome: slimOutcome,
      consultation_compose_context: composeContext,
      consultation: {
        consulted,
        primary: top.source,
        reason: top.reason,
      },
    },
    primarySource: top.source,
    delegatedAgent: top.agentName ?? AGENT_NAME_BY_INTENT[topIntent],
    consulted,
    reason: top.reason,
  };
}
