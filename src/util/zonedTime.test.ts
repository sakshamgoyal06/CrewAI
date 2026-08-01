import { describe, expect, it } from "vitest";

import {
  endOfLocalDay,
  formatZonedDateTime,
  formatZonedTimeOfDay,
  localDateKey,
  parseZonedTime,
  startOfLocalDay,
} from "./zonedTime.js";

describe("parseZonedTime", () => {
  it("reads a bare local time as wall clock in the zone", () => {
    const d = parseZonedTime("2026-08-01T21:00", "Asia/Kolkata");
    expect(d?.toISOString()).toBe("2026-08-01T15:30:00.000Z");
  });

  it("keeps an explicit offset as written", () => {
    const d = parseZonedTime("2026-08-01T21:00:00Z", "Asia/Kolkata");
    expect(d?.toISOString()).toBe("2026-08-01T21:00:00.000Z");
  });

  it("treats a date on its own as local midnight", () => {
    const d = parseZonedTime("2026-08-01", "Asia/Kolkata");
    expect(d?.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("lands on the right side of a daylight saving jump", () => {
    // New York moves to UTC-4 at 02:00 on 8 March 2026.
    expect(parseZonedTime("2026-03-08T01:30", "America/New_York")?.toISOString()).toBe(
      "2026-03-08T06:30:00.000Z",
    );
    expect(parseZonedTime("2026-03-08T03:30", "America/New_York")?.toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("round-trips through the zone it came from", () => {
    for (const local of ["2026-01-15T08:45", "2026-06-30T23:59", "2026-11-01T01:30"]) {
      const instant = parseZonedTime(local, "America/New_York");
      expect(instant).not.toBeNull();
      expect(
        `${localDateKey(instant as Date, "America/New_York")}T${formatZonedTimeOfDay(
          instant as Date,
          "America/New_York",
        )}`,
      ).toBe(local);
    }
  });

  it("returns null for something that is not a time", () => {
    expect(parseZonedTime("next tuesday-ish", "Asia/Kolkata")).toBeNull();
    expect(parseZonedTime("", "Asia/Kolkata")).toBeNull();
  });

  it("falls back to the naive reading when the zone is unknown", () => {
    expect(parseZonedTime("2026-08-01T21:00", "Mars/Olympus")?.toISOString()).toBe(
      "2026-08-01T21:00:00.000Z",
    );
  });
});

describe("local day boundaries", () => {
  it("spans midnight to midnight in the user's zone", () => {
    expect(startOfLocalDay("2026-08-01", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-07-31T18:30:00.000Z",
    );
    expect(endOfLocalDay("2026-08-01", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-08-01T18:30:00.000Z",
    );
  });

  it("counts whole days forward", () => {
    // Seven days after 30 August is 6 September, which begins at 18:30Z the evening before.
    expect(endOfLocalDay("2026-08-30", "Asia/Kolkata", 7)?.toISOString()).toBe(
      "2026-09-05T18:30:00.000Z",
    );
  });
});

describe("formatting", () => {
  it("renders an instant in the user's zone", () => {
    const d = new Date("2026-08-01T15:30:00.000Z");
    expect(formatZonedDateTime(d, "Asia/Kolkata")).toBe("Sat 1 Aug 21:00");
    expect(formatZonedTimeOfDay(d, "Asia/Kolkata")).toBe("21:00");
  });

  it("shows midnight as 00:00", () => {
    const d = new Date("2026-07-31T18:30:00.000Z");
    expect(formatZonedTimeOfDay(d, "Asia/Kolkata")).toBe("00:00");
  });
});
