import { describe, expect, it } from "vitest";

import {
  formatInstant,
  formatMinutes,
  formatMinuteOfDay,
  isDateOnly,
  localDateKey,
  startOfLocalDay,
  zonedTimeToInstant,
} from "./eventTime.js";

describe("zonedTimeToInstant", () => {
  it("reads a naive time as wall-clock time in the user's zone", () => {
    const at = zonedTimeToInstant("2026-07-31T21:00", "Asia/Kolkata");
    expect(at?.toISOString()).toBe("2026-07-31T15:30:00.000Z");
  });

  it("does not fall back to the host timezone", () => {
    const kolkata = zonedTimeToInstant("2026-07-31T21:00", "Asia/Kolkata");
    const london = zonedTimeToInstant("2026-07-31T21:00", "Europe/London");
    expect(kolkata?.toISOString()).not.toBe(london?.toISOString());
    expect(london?.toISOString()).toBe("2026-07-31T20:00:00.000Z");
  });

  it("uses the offset in force on that date, not today's", () => {
    // London is on BST in July and GMT in January.
    expect(zonedTimeToInstant("2026-01-15T09:00", "Europe/London")?.toISOString()).toBe(
      "2026-01-15T09:00:00.000Z",
    );
    expect(zonedTimeToInstant("2026-07-15T09:00", "Europe/London")?.toISOString()).toBe(
      "2026-07-15T08:00:00.000Z",
    );
  });

  it("keeps an explicit offset as given", () => {
    expect(zonedTimeToInstant("2026-07-31T15:30:00Z", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-07-31T15:30:00.000Z",
    );
    expect(zonedTimeToInstant("2026-07-31T21:00:00+05:30", "UTC")?.toISOString()).toBe(
      "2026-07-31T15:30:00.000Z",
    );
  });

  it("treats a bare date as local midnight", () => {
    expect(zonedTimeToInstant("2026-08-01", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-07-31T18:30:00.000Z",
    );
  });

  it("returns null for something that is not a time", () => {
    expect(zonedTimeToInstant("tomorrow evening", "Asia/Kolkata")).toBeNull();
    expect(zonedTimeToInstant("   ", "Asia/Kolkata")).toBeNull();
  });

  it("survives an unknown timezone rather than dropping the write", () => {
    expect(zonedTimeToInstant("2026-07-31T21:00", "Mars/Olympus")?.toISOString()).toBe(
      "2026-07-31T21:00:00.000Z",
    );
  });
});

describe("local day helpers", () => {
  it("names the local day, not the UTC one", () => {
    const lateEvening = new Date("2026-07-31T19:00:00Z");
    expect(localDateKey(lateEvening, "Asia/Kolkata")).toBe("2026-08-01");
    expect(localDateKey(lateEvening, "UTC")).toBe("2026-07-31");
  });

  it("finds the start of a local day relative to now", () => {
    const now = new Date("2026-07-31T19:00:00Z"); // 1 Aug, 00:30 in Kolkata
    expect(startOfLocalDay(now, "Asia/Kolkata").toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(startOfLocalDay(now, "Asia/Kolkata", -1).toISOString()).toBe("2026-07-30T18:30:00.000Z");
  });

  it("recognises a bare date", () => {
    expect(isDateOnly("2026-08-01")).toBe(true);
    expect(isDateOnly("2026-08-01T09:00")).toBe(false);
  });
});

describe("formatting", () => {
  it("shows an instant in the user's zone", () => {
    const at = new Date("2026-07-31T15:30:00Z");
    expect(formatInstant(at, "Asia/Kolkata")).toBe("Fri 31 Jul 21:00");
    expect(formatInstant(at, "Asia/Kolkata", { dateOnly: true })).toBe("Fri 31 Jul");
  });

  it("says times and durations the way a person does", () => {
    expect(formatMinuteOfDay(21 * 60 + 5)).toBe("21:05");
    expect(formatMinuteOfDay(0)).toBe("00:00");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(80)).toBe("1h 20m");
    expect(formatMinutes(120)).toBe("2h");
  });
});
