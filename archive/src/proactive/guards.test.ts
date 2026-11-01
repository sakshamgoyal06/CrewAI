import { describe, expect, it } from "vitest";

import { inQuietHours } from "./guards.js";

describe("inQuietHours", () => {
  it("blocks 23:00–05:59 local", () => {
    const tz = "Asia/Kolkata";
    expect(inQuietHours(new Date("2026-08-06T17:30:00.000Z"), tz)).toBe(true); // 23:00 IST
    expect(inQuietHours(new Date("2026-08-06T18:30:00.000Z"), tz)).toBe(true); // 00:00 IST
    expect(inQuietHours(new Date("2026-08-06T04:00:00.000Z"), tz)).toBe(false); // 09:30 IST
  });
});
