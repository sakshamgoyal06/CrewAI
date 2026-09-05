import { describe, expect, it } from "vitest";

import { isLateEveningHour } from "./loadGrowthSnapshot.js";

describe("loadGrowthSnapshot re-exports", () => {
  it("isLateEveningHour is re-exported", () => {
    expect(isLateEveningHour(22)).toBe(true);
  });
});
