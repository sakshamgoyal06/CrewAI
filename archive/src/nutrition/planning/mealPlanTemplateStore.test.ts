import { describe, expect, it } from "vitest";

import { formatTemplateList } from "./mealPlanTemplateStore.js";

describe("mealPlanTemplateStore", () => {
  it("formatTemplateList handles empty", () => {
    expect(formatTemplateList([])).toContain("No saved meal plan templates");
  });

  it("formatTemplateList shows templates", () => {
    const out = formatTemplateList([
      {
        id: "1",
        user_profile_id: "u1",
        name: "High protein",
        description: null,
        day_count: 7,
        slots: ["breakfast", "lunch", "dinner"],
        entries: [{ day_offset: 0, meal_slot: "lunch", title: "Bowl" }],
        created_at: "",
        updated_at: "",
      },
    ]);
    expect(out).toContain("High protein");
  });
});
