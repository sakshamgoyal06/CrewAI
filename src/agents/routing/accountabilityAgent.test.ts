import { describe, expect, it } from "vitest";
import { claimsPersistence } from "./actionIntegrity.js";

describe("actionIntegrity with ledger path", () => {
  it("detects write claims", () => {
    expect(claimsPersistence("I've added that to your calendar.")).toBe(true);
    expect(claimsPersistence("Here is some advice only.")).toBe(false);
  });
});
