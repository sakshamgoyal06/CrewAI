import { describe, expect, it } from "vitest";

import { isFirstDayOfMonth, isLocalWeekday, localWeekdayShort } from "./localWeekday.js";

describe("localWeekday", () => {
  it("detects Monday in UTC", () => {
    const mon = new Date("2026-08-03T12:00:00.000Z");
    expect(localWeekdayShort(mon, "UTC")).toBe("mon");
    expect(isLocalWeekday(mon, "UTC", "mon")).toBe(true);
    expect(isLocalWeekday(mon, "UTC", "fri")).toBe(false);
  });

  it("detects first day of month", () => {
    const first = new Date("2026-08-01T10:00:00.000Z");
    expect(isFirstDayOfMonth(first, "UTC")).toBe(true);
    const second = new Date("2026-08-02T10:00:00.000Z");
    expect(isFirstDayOfMonth(second, "UTC")).toBe(false);
  });
});
