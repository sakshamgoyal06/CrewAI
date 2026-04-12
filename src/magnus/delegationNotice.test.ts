import { describe, expect, it } from "vitest";

import { formatDelegationNotice } from "./delegationNotice.js";

describe("formatDelegationNotice", () => {
  it("includes display label and intent phrase", () => {
    const s = formatDelegationNotice("HealthComposite", "HEALTH");
    expect(s).toContain("Health");
    expect(s).toContain("health");
    expect(s).toContain("specialist");
  });

  it("falls back to raw agent name when unknown", () => {
    const s = formatDelegationNotice("CustomAgent", "LEARNING");
    expect(s).toContain("CustomAgent");
  });
});
