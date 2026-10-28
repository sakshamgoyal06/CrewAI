import { describe, expect, it } from "vitest";

import { isFullLockCommand, parsePartialLockDates } from "./parsePartialLock.js";

describe("parsePartialLockDates", () => {
  const horizonStart = "2026-08-11";
  const horizonEnd = "2026-08-17";

  it("parses explicit date range within horizon", () => {
    expect(parsePartialLockDates("save 2026-08-11 to 2026-08-13", horizonStart, horizonEnd)).toEqual([
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
  });

  it("parses weekday list (Mon, Wed)", () => {
    const dates = parsePartialLockDates("lock Mon and Wed only", horizonStart, horizonEnd);
    expect(dates).toEqual(["2026-08-12", "2026-08-17"]);
  });

  it("parses weekday range Mon–Wed", () => {
    const dates = parsePartialLockDates("save plan for Mon-Wed", horizonStart, horizonEnd);
    expect(dates).toEqual(["2026-08-11", "2026-08-12", "2026-08-17"]);
  });

  it("returns null for full-lock phrases", () => {
    expect(parsePartialLockDates("save plan", horizonStart, horizonEnd)).toBeNull();
    expect(parsePartialLockDates("looks good", horizonStart, horizonEnd)).toBeNull();
  });
});

describe("isFullLockCommand", () => {
  it("matches affirmative lock phrases", () => {
    expect(isFullLockCommand("save plan")).toBe(true);
    expect(isFullLockCommand("lock it")).toBe(true);
    expect(isFullLockCommand("looks good")).toBe(true);
  });

  it("rejects partial lock phrasing", () => {
    expect(isFullLockCommand("save Mon only")).toBe(false);
  });
});
