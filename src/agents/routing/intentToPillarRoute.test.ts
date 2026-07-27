import { describe, expect, it } from "vitest";

import type { Intent } from "../../intent.js";
import { INTENTS } from "../../intent.js";
import {
  intentToPillarRoute,
  resolvePillarRoute,
} from "./intentToPillarRoute.js";
import type { PillarRoute } from "./pillarTypes.js";

/** Expected route for each intent — kept exhaustive via `satisfies Record<Intent, PillarRoute>`. */
const INTENT_TO_ROUTE = {
  HEALTH: { pillar: "health", department: "nutrition" },
  WEALTH: { pillar: "wealth", department: "trading" },
  BUILD: { pillar: "wisdom", department: "build_ship" },
  PLANNING: { pillar: "wisdom", department: "build_ship" },
  RELATIONSHIPS: { pillar: "joy", department: "relationships" },
  LEARNING: { pillar: "wisdom", department: "learning_plan_development" },
  HAPPINESS: { pillar: "joy", department: "adventure_trips" },
  CULTURE: { pillar: "joy", department: "culture_leisure" },
  NOTION: { pillar: "wisdom", department: "learning_plan_development" },
  GENERAL: { pillar: "wisdom", department: "tracking_habits" },
} satisfies Record<Intent, PillarRoute>;

describe("intentToPillarRoute", () => {
  it.each(INTENTS)("maps %s to the expected pillar route", (intent) => {
    expect(intentToPillarRoute(intent)).toEqual(INTENT_TO_ROUTE[intent]);
  });
});


describe("resolvePillarRoute", () => {
  it("uses slash department when provided", () => {
    expect(resolvePillarRoute("WEALTH", "investment")).toEqual({
      pillar: "wealth",
      department: "investment",
    });
  });

  it("falls back to intentToPillarRoute when slash department omitted", () => {
    expect(resolvePillarRoute("PLANNING")).toEqual(intentToPillarRoute("PLANNING"));
  });
});
