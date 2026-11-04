import { describe, expect, it } from "vitest";

import { addDays, dateOf, dayNumber, daysBetween, localClock, localHourOf, tzOffsetMs } from "./time.js";

describe("time helpers", () => {
  it("steps date keys across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dateOf(dayNumber("2026-11-03"))).toBe("2026-11-03");
    expect(daysBetween("2026-11-01", "2026-11-08")).toBe(7);
  });

  it("reads the wall clock in a timezone, midnight as 00", () => {
    const c = localClock(new Date("2026-11-03T18:30:00Z"), "Asia/Kolkata");
    expect(c).toEqual({ hhmm: "00:00", hour: 0, minute: 0, minutes: 0, weekday: 3, dateKey: "2026-11-04" });
    expect(localClock(new Date("2026-11-03T02:15:00Z"), "America/New_York").dateKey).toBe("2026-11-02");
    expect(localHourOf("2026-11-03T02:00:00Z", "Asia/Kolkata")).toBe(7.5);
  });

  it("gives the zone offset", () => {
    expect(tzOffsetMs(new Date("2026-11-03T00:00:00Z"), "Asia/Kolkata")).toBe(330 * 60_000);
    expect(tzOffsetMs(new Date("2026-07-01T00:00:00Z"), "America/New_York")).toBe(-240 * 60_000);
  });
});
