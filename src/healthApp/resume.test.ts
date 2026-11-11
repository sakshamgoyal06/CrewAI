import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {} }));

const { keepDatePlan, pendingResume } = await import("./resume.js");

const b = (id: string, end: string, extra: Record<string, unknown> = {}) => ({ id, scope: "plan" as const, itemId: null, reason: "travel" as const, note: null, startDate: "2026-11-01", endDate: end, endedAt: null, ...extra });

describe("resume after a whole-plan pause", () => {
  it("waits for a choice once the pause is over (or ends today), until answered", () => {
    expect(pendingResume([b("a", "2026-11-12")], "2026-11-11")).toBeNull();
    expect(pendingResume([b("a", "2026-11-11")], "2026-11-11")?.id).toBe("a");
    expect(pendingResume([b("a", "2026-11-10", { resumedAt: "x" })], "2026-11-11")).toBeNull();
    expect(pendingResume([{ ...b("i", "2026-11-10"), scope: "item" as const, itemId: "g" }], "2026-11-11")).toBeNull();
  });

  it("refuses to keep the date when the pace isn't safe", () => {
    expect(keepDatePlan({ currentKcal: 2200, suggestedKcal: 1600, capped: true, safeDate: "2027-03-01", neededKgPerWeek: -1.2, stepTarget: 8000, weightKg: 80 })).toEqual({ safe: false, safeDate: "2027-03-01", neededKgPerWeek: -1.2 });
  });

  it("adds steps first, then trims calories, and says what changes", () => {
    const small = keepDatePlan({ currentKcal: 2200, suggestedKcal: 2100, capped: false, safeDate: null, neededKgPerWeek: -0.7, stepTarget: 8000, weightKg: 80 });
    expect(small).toMatchObject({ safe: true, steps: { from: 8000, to: 10500 }, calories: { from: 2200, to: 2200 } });
    const big = keepDatePlan({ currentKcal: 2200, suggestedKcal: 1900, capped: false, safeDate: null, neededKgPerWeek: -0.8, stepTarget: 8000, weightKg: 80 });
    expect(big).toMatchObject({ safe: true, steps: { to: 12000 }, calories: { to: 2060 } });
    if (big.safe) expect(big.changes.join(" ")).toMatch(/Steps: 8,000 → 12,000.*Calories: 2,200 → 2,060/);
  });
});
