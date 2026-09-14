import { describe, expect, it } from "vitest";

import { collapseMealIntakeForSingleOccasion } from "./mealIntakeCollapse.js";
import type { MealIntakeParseResult } from "../agents/health/mealIntakeParserAgent.js";

function intake(meals: MealIntakeParseResult["meals"]): MealIntakeParseResult {
  return { replaceTodayLog: false, meals, parser: "llm" };
}

describe("collapseMealIntakeForSingleOccasion", () => {
  it("merges same-slot parser splits into one meal_log step", () => {
    const raw = intake([
      {
        mealSlot: "lunch",
        logKind: "meal",
        mealText: "2 paratha",
        components: [{ user_label: "paratha", api_query: "paratha" }],
      },
      {
        mealSlot: "lunch",
        logKind: "meal",
        mealText: "bhindi sabji",
        components: [{ user_label: "bhindi", api_query: "bhindi sabzi" }],
      },
      {
        mealSlot: "lunch",
        logKind: "meal",
        mealText: "boondi raita",
        components: [{ user_label: "raita", api_query: "boondi raita" }],
      },
    ]);
    const collapsed = collapseMealIntakeForSingleOccasion(
      raw,
      "I had 2 paratha, bhindi sabji, and boondi raita for lunch",
    );
    expect(collapsed.meals).toHaveLength(1);
    expect(collapsed.meals[0]!.mealText).toContain("paratha");
    expect(collapsed.meals[0]!.components).toHaveLength(3);
  });

  it("keeps multi-slot full-day recounts separate", () => {
    const raw = intake([
      {
        mealSlot: "breakfast",
        logKind: "meal",
        mealText: "tea",
        components: [{ user_label: "tea", api_query: "tea" }],
      },
      {
        mealSlot: "lunch",
        logKind: "meal",
        mealText: "parathas",
        components: [{ user_label: "paratha", api_query: "paratha" }],
      },
    ]);
    const collapsed = collapseMealIntakeForSingleOccasion(
      raw,
      "For breakfast I had tea. For lunch I had parathas.",
    );
    expect(collapsed.meals).toHaveLength(2);
  });
});
