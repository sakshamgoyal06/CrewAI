import { afterEach, describe, expect, it } from "vitest";

import { healthListenPort } from "./env.js";

describe("env helpers", () => {
  afterEach(() => {
    delete process.env.HEALTH_PORT;
    delete process.env.PORT;
  });

  it("healthListenPort defaults to 8080", () => {
    expect(healthListenPort()).toBe(8080);
  });

  it("healthListenPort reads HEALTH_PORT", () => {
    process.env.HEALTH_PORT = "3001";
    expect(healthListenPort()).toBe(3001);
  });
});
