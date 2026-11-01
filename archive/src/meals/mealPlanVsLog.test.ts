import { describe, expect, it } from "vitest";

import {
  MEAL_DATA_ARCHITECTURE,
  MEAL_LOG_ONLY_TOTALS_RULE,
  MEAL_PLAN_VS_LOG_RULES,
} from "./mealPlanVsLog.js";

describe("mealPlanVsLog", () => {
  it("documents separate stores for agents", () => {
    expect(MEAL_PLAN_VS_LOG_RULES).toContain("meal_plan_entries");
    expect(MEAL_PLAN_VS_LOG_RULES).toContain("meal_logs");
    expect(MEAL_DATA_ARCHITECTURE).toContain("meal_plan_entries");
    expect(MEAL_DATA_ARCHITECTURE).toContain("meal_logs");
    expect(MEAL_LOG_ONLY_TOTALS_RULE).toContain("only");
  });
});
