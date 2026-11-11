import { describe, expect, it } from "vitest";
import { lapseDue, lapseNudge } from "./lapse.js";

describe("lapse ladder", () => {
  it("fires on days 2, 3, 5, 7, 14, then every 3 days to 30 and weekly to 60", () => {
    const days = Array.from({ length: 70 }, (_, i) => i).filter(lapseDue);
    expect(days).toEqual([2, 3, 5, 7, 14, 17, 20, 23, 26, 29, 37, 44, 51, 58]);
  });

  it("ties the later messages to the goal and varies them", () => {
    const s = { goal: { metrics: [{ latest: 118, target: 113, unit: "kg" }] } } as never;
    expect(lapseNudge(s, 7, "2026-11-11")!.body).toMatch(/5 kg from 113 kg/);
    const texts = [17, 20, 23, 26].map((d) => lapseNudge(s, d, "2026-11-11")!.title);
    expect(new Set(texts).size).toBe(4);
    expect(lapseNudge(s, 4, "2026-11-11")).toBeNull();
    expect(lapseNudge(s, 14, "2026-11-11")!.title).toMatch(/every few days/);
  });
});
