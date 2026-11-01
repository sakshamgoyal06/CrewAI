import { describe, expect, it } from "vitest";

import { authenticateHealthApp } from "./auth.js";

const config = { token: "a".repeat(32), userProfileId: "profile-1" };

describe("authenticateHealthApp", () => {
  it("accepts the configured bearer token", () => {
    expect(authenticateHealthApp(`Bearer ${"a".repeat(32)}`, config)).toBe("profile-1");
  });

  it("rejects a wrong or missing token", () => {
    expect(authenticateHealthApp(`Bearer ${"b".repeat(32)}`, config)).toBeNull();
    expect(authenticateHealthApp(undefined, config)).toBeNull();
    expect(authenticateHealthApp("a".repeat(32), config)).toBeNull();
  });

  it("rejects everything when the app is not configured", () => {
    expect(authenticateHealthApp(`Bearer ${"a".repeat(32)}`, null)).toBeNull();
  });
});
