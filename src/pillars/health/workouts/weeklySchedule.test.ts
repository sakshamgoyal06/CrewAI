import { describe, expect, it } from "vitest";

import {
  scheduledGymSessionForWeekday,
  formatScheduledGymBlock,
} from "./weeklySchedule.js";

const SAMPLE = `
| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|-----|-----|-----|-----|-----|-----|-----|
| **Gym AM** | Push A | Pull A | Cardio+Abs | Push B | Pull B | Legs (PM) | optional / rest |
`;

describe("weeklySchedule", () => {
  it("returns Monday Push A", () => {
    expect(scheduledGymSessionForWeekday(SAMPLE, 1)).toBe("Push A");
    expect(scheduledGymSessionForWeekday(SAMPLE, 3)).toBe("Cardio+Abs");
  });

  it("formats authoritative block for today", () => {
    const block = formatScheduledGymBlock({
      weeklyScheduleMarkdown: SAMPLE,
      now: new Date("2026-08-03T12:00:00Z"),
      timeZone: "Asia/Kolkata",
    });
    expect(block).toContain("Push A");
    expect(block).toContain("authoritative");
  });
});
