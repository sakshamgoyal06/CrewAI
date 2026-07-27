import { describe, expect, it } from "vitest";

import type { Intent } from "../../intent.js";
import { INTENTS } from "../../intent.js";
import { intentToPillarRoute } from "./intentToPillarRoute.js";
import type { PillarRoute } from "./pillarTypes.js";

/** Exhaustive by construction: `satisfies Record<Intent, …>` fails to compile if an intent is added. */
const INTENT_TO_ROUTE = {
  HEALTH: { pillar: "health", department: "nutrition" },
  WEALTH: { pillar: "wealth", department: "net_worth_balance_sheet" },
  HAPPINESS: { pillar: "joy", department: "culture_leisure" },
  WISDOM: { pillar: "wisdom", department: "learning_plan_development" },
  GENERAL: { pillar: "wisdom", department: "tracking_habits" },
} satisfies Record<Intent, PillarRoute>;

describe("intentToPillarRoute", () => {
  it.each(INTENTS)("maps %s to the expected pillar route", (intent) => {
    expect(intentToPillarRoute(intent)).toEqual(INTENT_TO_ROUTE[intent]);
  });
});
