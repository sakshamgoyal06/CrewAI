import { afterEach, describe, expect, it } from "vitest";

import { healthListenPort, rateLimitPerMinute } from "./env.js";

describe("env helpers", () => {
  afterEach(() => {
    delete process.env.MAGNUS_RATE_LIMIT_PER_MINUTE;
    delete process.env.HEALTH_PORT;
    delete process.env.PORT;
  });

  it("rateLimitPerMinute defaults to 30", () => {
    expect(rateLimitPerMinute()).toBe(30);
  });

  it("rateLimitPerMinute respects 0", () => {
    process.env.MAGNUS_RATE_LIMIT_PER_MINUTE = "0";
    expect(rateLimitPerMinute()).toBe(0);
  });

  it("healthListenPort defaults to 8080", () => {
    expect(healthListenPort()).toBe(8080);
  });

  it("healthListenPort reads HEALTH_PORT", () => {
    process.env.HEALTH_PORT = "3001";
    expect(healthListenPort()).toBe(3001);
  });
});
