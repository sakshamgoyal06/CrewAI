import { describe, expect, it } from "vitest";

import { dayBoundsUtc, defaultEventWindow } from "./dateRange.js";

describe("defaultEventWindow", () => {
  it("returns ISO range with max ~7 days ahead", () => {
    const { timeMin, timeMax } = defaultEventWindow();
    const start = new Date(timeMin).getTime();
    const end = new Date(timeMax).getTime();
    expect(end - start).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(end - start).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });
});

describe("dayBoundsUtc", () => {
  it("covers full UTC day", () => {
    const { timeMin, timeMax } = dayBoundsUtc("2026-07-20");
    expect(timeMin).toBe("2026-07-20T00:00:00.000Z");
    expect(timeMax).toBe("2026-07-20T23:59:59.999Z");
  });
});
