import { describe, expect, it, vi } from "vitest";

import { formatDateKeyInTimeZone, withNotionRetry } from "./notion.js";

describe("formatDateKeyInTimeZone", () => {
  it("formats YYYY-MM-DD in a fixed timezone", () => {
    const d = new Date("2026-04-12T15:00:00.000Z");
    expect(formatDateKeyInTimeZone(d, "Asia/Kolkata")).toBe("2026-04-12");
  });
});

describe("withNotionRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(withNotionRetry("test", fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
