import { describe, expect, it } from "vitest";

import { formatMealLogSaveFailure } from "./mealLogPipeline.js";

describe("formatMealLogSaveFailure", () => {
  it("suggests migration when table missing", () => {
    expect(
      formatMealLogSaveFailure('relation "public.meal_logs" does not exist'),
    ).toContain("20260412180000_meal_logs");
  });
  it("suggests migration path for schema cache errors", () => {
    expect(formatMealLogSaveFailure("PGRST205")).toContain("meal_logs");
  });
});
