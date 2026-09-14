import { describe, expect, it } from "vitest";

import { maintenanceStatus } from "./maintenance.js";

describe("maintenanceStatus", () => {
  it("reports v1 retired", () => {
    const s = maintenanceStatus();
    expect(s.status).toBe("maintenance");
    expect(s.magnus).toBe("v1_retired");
    expect(s.message.length).toBeGreaterThan(20);
  });
});
