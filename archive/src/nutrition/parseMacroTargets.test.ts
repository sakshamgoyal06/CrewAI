import { describe, expect, it } from "vitest";

import { parseMacroTargetsFromText } from "./parseMacroTargets.js";

describe("parseMacroTargetsFromText", () => {
  it("parses calorie and protein targets", () => {
    expect(parseMacroTargetsFromText("2000 kcal and 140g protein")).toEqual({
      daily_calorie_target: 2000,
      daily_protein_g_target: 140,
      daily_carbs_g_target: null,
      daily_fat_g_target: null,
    });
  });

  it("returns nulls for skip", () => {
    expect(parseMacroTargetsFromText("skip").daily_calorie_target).toBeNull();
  });
});
