import { describe, expect, it } from "vitest";

import { ENERGY_SYSTEM } from "./energyAgent.js";

describe("energyAgent", () => {
  it("exports ENERGY_SYSTEM with roster-aligned non-clinical and seek-care guardrails", () => {
    expect(ENERGY_SYSTEM).toMatch(/not.*doctor.*clinician/i);
    expect(ENERGY_SYSTEM).toMatch(/not diagnosis/i);
    expect(ENERGY_SYSTEM).toMatch(/HRV/i);
    expect(ENERGY_SYSTEM).toMatch(/seek professional/i);
  });
});
