import { describe, expect, it } from "vitest";

import {
  hasFitnessKeyword,
  parseHealthSubIntentLabel,
} from "./healthSubIntent.js";

describe("healthSubIntent", () => {
  describe("hasFitnessKeyword", () => {
    it("matches workout and training language", () => {
      expect(hasFitnessKeyword("Leg day at the gym")).toBe(true);
      expect(hasFitnessKeyword("Need more steps today")).toBe(true);
      expect(hasFitnessKeyword("Hit a new PR on squat")).toBe(true);
    });

    it("returns false for nutrition-only phrasing", () => {
      expect(hasFitnessKeyword("How much protein on a cut?")).toBe(false);
    });
  });

  describe("parseHealthSubIntentLabel", () => {
    it("parses strict labels deterministically", () => {
      expect(parseHealthSubIntentLabel("FITNESS")).toBe("FITNESS");
      expect(parseHealthSubIntentLabel(" NUTRITION \n")).toBe("NUTRITION");
      expect(parseHealthSubIntentLabel("Reply: ENERGY.")).toBe("ENERGY");
      expect(parseHealthSubIntentLabel("OTHER")).toBe("OTHER");
      expect(parseHealthSubIntentLabel("unknown")).toBe("OTHER");
    });
  });
});
