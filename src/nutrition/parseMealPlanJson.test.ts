import { describe, expect, it } from "vitest";

import { extractMealPlanJson, stripMealPlanJsonBlock } from "./parseMealPlanJson.js";

describe("parseMealPlanJson", () => {
  it("extracts entries from fenced JSON", () => {
    const text = `Here is your week:

\`\`\`json
{"entries":[{"local_date":"2026-08-09","meal_slot":"lunch","title":"Dal and rice"}]}
\`\`\``;
    expect(extractMealPlanJson(text)).toEqual([
      { local_date: "2026-08-09", meal_slot: "lunch", title: "Dal and rice", description: null },
    ]);
    expect(stripMealPlanJsonBlock(text)).toContain("Here is your week");
    expect(stripMealPlanJsonBlock(text)).not.toContain("entries");
  });

  it("returns null when no valid JSON", () => {
    expect(extractMealPlanJson("Just some meal ideas without JSON")).toBeNull();
  });
});
