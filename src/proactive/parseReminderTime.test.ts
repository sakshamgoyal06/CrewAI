import { describe, expect, it } from "vitest";

import { parseReminderTime } from "./parseReminderTime.js";

describe("parseReminderTime", () => {
  const tz = "Asia/Kolkata";
  const now = new Date("2026-08-06T10:00:00.000Z"); // 15:30 IST

  it("parses in N minutes", () => {
    const at = parseReminderTime("in 30 minutes", tz, now);
    expect(at?.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it("parses tomorrow 8pm", () => {
    const at = parseReminderTime("tomorrow 8pm", tz, now);
    expect(at).not.toBeNull();
    expect(at!.toISOString()).toContain("2026-08-07");
  });

  it("parses naive ISO via zonedTimeToInstant", () => {
    const at = parseReminderTime("2026-08-07T20:00:00", tz, now);
    expect(at).not.toBeNull();
  });
});
