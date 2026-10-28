import { describe, expect, it } from "vitest";

import {
  entryMentionsAvoidedFood,
  filterAvoidedMealPlanEntries,
  mergeAvoidFoods,
  parseAvoidFoodsFromRestrictions,
  parseAvoidFoodsFromRevision,
} from "./mealPlanningAvoidList.js";

describe("mealPlanningAvoidList", () => {
  it("parses avoid list from dietary restrictions", () => {
    expect(
      parseAvoidFoodsFromRestrictions("In non veg only boneless chicken. Avoid lauki."),
    ).toEqual(["lauki"]);
  });

  it("parses remove X from revision text", () => {
    expect(
      parseAvoidFoodsFromRevision("No, lauki was on my avoid list. Remove lauki, keep the original plan"),
    ).toContain("lauki");
  });

  it("filters entries mentioning avoided foods", () => {
    const entries = [
      { local_date: "2026-08-17", meal_slot: "dinner" as const, title: "Lauki chana dal" },
      { local_date: "2026-08-17", meal_slot: "lunch" as const, title: "Rajma + rice" },
    ];
    const filtered = filterAvoidedMealPlanEntries(entries, mergeAvoidFoods(["lauki"]));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe("Rajma + rice");
  });

  it("detects lauki in title", () => {
    expect(
      entryMentionsAvoidedFood(
        { local_date: "2026-08-20", meal_slot: "dinner", title: "Lauki sabzi + dal" },
        ["lauki"],
      ),
    ).toBe(true);
  });
});
