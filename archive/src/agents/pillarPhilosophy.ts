/**
 * Four-pillar product philosophy — single source of truth for routing metadata and docs.
 *
 * The user always talks to Magnus (GENERAL intent / coordinator). Four pillar specialists
 * execute depth silently; the user never addresses them directly.
 *
 * Minimal mode may park runtime depth for some pillars without removing this model.
 */
import type { Intent } from "../intent.js";
import { isMinimalMode, isParkedIntent } from "../config/minimalMode.js";
import type { PillarRoute } from "./routing/pillarTypes.js";

export type PillarIntent = Exclude<Intent, "GENERAL">;

export type PillarDefinition = {
  intent: PillarIntent;
  /** Stored metadata label (`pillarTypes.Pillar`). Happiness → joy. */
  pillar: PillarRoute["pillar"];
  department: string;
  title: string;
  scope: string;
};

/** The four pillars — order matches classifier and registry. */
export const FOUR_PILLARS: readonly PillarDefinition[] = [
  {
    intent: "HEALTH",
    pillar: "health",
    department: "nutrition",
    title: "Health",
    scope: "Training, workouts, meals, sleep, recovery, energy, health journal.",
  },
  {
    intent: "WEALTH",
    pillar: "wealth",
    department: "net_worth_balance_sheet",
    title: "Wealth",
    scope: "Budgeting, spending, saving, debt, net worth, financial goals, investing philosophy.",
  },
  {
    intent: "HAPPINESS",
    pillar: "joy",
    department: "culture_leisure",
    title: "Happiness",
    scope: "Books, film, music, games, hobbies, rest, travel, relationships.",
  },
  {
    intent: "WISDOM",
    pillar: "wisdom",
    department: "learning_plan_development",
    title: "Wisdom",
    scope: "Learning plans, skills, career direction, shipping projects.",
  },
] as const;

export const MAGNUS_COORDINATOR: PillarRoute = {
  pillar: "wisdom",
  department: "magnus",
};

export function pillarDefinitionForIntent(intent: PillarIntent): PillarDefinition {
  const found = FOUR_PILLARS.find((p) => p.intent === intent);
  if (!found) {
    throw new Error(`unknown pillar intent: ${intent}`);
  }
  return found;
}

export function intentToPillarRoute(intent: Intent): PillarRoute {
  if (intent === "GENERAL") {
    return MAGNUS_COORDINATOR;
  }
  const def = pillarDefinitionForIntent(intent);
  return { pillar: def.pillar, department: def.department };
}

/** Whether this pillar intent may dispatch to a specialist in the current mode. */
export function isPillarIntentLive(intent: Intent): boolean {
  if (intent === "GENERAL") {
    return true;
  }
  if (isMinimalMode() && isParkedIntent(intent)) {
    return false;
  }
  return true;
}

export function livePillarIntents(): PillarIntent[] {
  return FOUR_PILLARS.filter((p) => isPillarIntentLive(p.intent)).map((p) => p.intent);
}

export function parkedPillarIntents(): PillarIntent[] {
  return FOUR_PILLARS.filter((p) => !isPillarIntentLive(p.intent)).map((p) => p.intent);
}
