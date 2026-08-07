/**
 * Multi-agent consultation: Magnus coordinates, relevant pillars advise, reconciler picks the reply.
 */
import type { AgentResult } from "../types.js";
import { hasSuccessfulWriteTool } from "./actionIntegrity.js";
import {
  looksLikeHealthFitnessIntent,
  messageHasHealthSignal,
} from "./healthConsultationSignals.js";

export type ConsultedAgent = "magnus" | "health";

export type ConsultationReconcileInput = {
  userMessage: string;
  magnus: AgentResult;
  health: AgentResult | null;
};

export type ConsultationReconcileOutcome = {
  text: string;
  metadata: Record<string, unknown>;
  primarySource: ConsultedAgent;
  consulted: ConsultedAgent[];
  reason: string;
};

const MAGNUS_DENIES_HEVY_RE =
  /\b(?:don'?t|do not|cannot|can'?t|unable to)\b.{0,60}\b(?:hevy|workout data|sets?|reps?|weights?)\b|\bno (?:direct )?hevy\b|\bnot connected\b.{0,30}\bhevy\b/i;

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

function magnusDeniedHevyCapability(text: string): boolean {
  return MAGNUS_DENIES_HEVY_RE.test(text);
}

function mergeConsultationTexts(healthText: string, magnusText: string): string {
  const h = healthText.trim();
  const m = magnusText.trim();
  if (!h) {
    return m;
  }
  if (!m) {
    return h;
  }
  return `${h}\n\n${m}`;
}

/**
 * Pick the user-facing reply when Magnus and Health both ran on a GENERAL turn.
 */
export function reconcileConsultationOutputs(
  input: ConsultationReconcileInput,
): ConsultationReconcileOutcome {
  const consulted: ConsultedAgent[] = ["magnus"];
  const magnusMeta = input.magnus.metadata ?? {};
  const health = input.health;
  const healthMeta = health?.metadata ?? {};

  if (!health || !healthIsSubstantive(healthMeta)) {
    return {
      text: input.magnus.text,
      metadata: {
        ...magnusMeta,
        consultation: {
          consulted,
          primary: "magnus",
          reason: health ? "health_generic_or_empty" : "health_not_run",
        },
      },
      primarySource: "magnus",
      consulted,
      reason: health ? "health_generic_or_empty" : "health_not_run",
    };
  }

  consulted.push("health");

  const magnusWrote = hasSuccessfulWriteTool(magnusMeta);
  const hevyLoaded = healthLoadedHevy(healthMeta);
  const fitnessTurn = healthMeta.health_order === "fitness";
  const healthSignal =
    messageHasHealthSignal(input.userMessage) || looksLikeHealthFitnessIntent(input.userMessage);
  const magnusWrongAboutHevy = magnusDeniedHevyCapability(input.magnus.text);

  if (magnusWrote && hevyLoaded && fitnessTurn) {
    return {
      text: mergeConsultationTexts(health.text, input.magnus.text),
      metadata: {
        ...healthMeta,
        ...magnusMeta,
        specialist: healthMeta.specialist ?? "Fitness",
        consultation: {
          consulted,
          primary: "health",
          reason: "merged_hevy_review_and_magnus_write",
        },
      },
      primarySource: "health",
      consulted,
      reason: "merged_hevy_review_and_magnus_write",
    };
  }

  if ((hevyLoaded && fitnessTurn && healthSignal) || (magnusWrongAboutHevy && hevyLoaded)) {
    return {
      text: health.text,
      metadata: {
        ...healthMeta,
        consultation: {
          consulted,
          primary: "health",
          reason: magnusWrongAboutHevy ? "magnus_denied_hevy_health_had_data" : "health_fitness_hevy_data",
        },
      },
      primarySource: "health",
      consulted,
      reason: magnusWrongAboutHevy ? "magnus_denied_hevy_health_had_data" : "health_fitness_hevy_data",
    };
  }

  if (magnusWrote) {
    return {
      text: input.magnus.text,
      metadata: {
        ...magnusMeta,
        consultation: {
          consulted,
          primary: "magnus",
          reason: "magnus_successful_write",
          health_alternate: health.text.slice(0, 500),
        },
      },
      primarySource: "magnus",
      consulted,
      reason: "magnus_successful_write",
    };
  }

  if (healthSignal) {
    return {
      text: health.text,
      metadata: {
        ...healthMeta,
        consultation: {
          consulted,
          primary: "health",
          reason: "health_domain_signal",
        },
      },
      primarySource: "health",
      consulted,
      reason: "health_domain_signal",
    };
  }

  return {
    text: input.magnus.text,
    metadata: {
      ...magnusMeta,
      consultation: {
        consulted,
        primary: "magnus",
        reason: "default_magnus_coordinator",
      },
    },
    primarySource: "magnus",
    consulted,
    reason: "default_magnus_coordinator",
  };
}
