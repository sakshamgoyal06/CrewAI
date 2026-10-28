import { describe, expect, it } from "vitest";

import {
  isMealPlanCancelMessage,
  sanitizeMealPlanningUserMessage,
} from "./mealPlanningRouting.js";

describe("mealPlanningRouting", () => {
  it("detects cancel planning", () => {
    expect(isMealPlanCancelMessage("cancel planning")).toBe(true);
    expect(isMealPlanCancelMessage("please cancel plan")).toBe(true);
  });

  it("strips pillar step context from user text", () => {
    expect(
      sanitizeMealPlanningUserMessage(
        "Plan 2 weeks\n\n---\nStep focus: gather constraints",
      ),
    ).toBe("Plan 2 weeks");
  });
});
