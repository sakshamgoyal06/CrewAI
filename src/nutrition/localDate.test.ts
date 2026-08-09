import { describe, expect, it } from "vitest";

import { localDateKey, resolveTimezone } from "./localDate.js";

describe("localDate", () => {
  it("resolveTimezone falls back to UTC for invalid tz", () => {
    expect(resolveTimezone("Not/A_Timezone")).toBe("UTC");
  });

  it("localDateKey uses user timezone", () => {
    const instant = new Date("2026-04-12T20:30:00.000Z");
    expect(localDateKey(instant, "Asia/Kolkata")).toBe("2026-04-13");
    expect(localDateKey(instant, "UTC")).toBe("2026-04-12");
  });
});
