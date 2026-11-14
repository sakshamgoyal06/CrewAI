import { describe, expect, it } from "vitest";

import { acceptedTarget, gapCause, gapDefaults, gapLine, plannedProtein, proteinGapOf, rulesKey, type StoredGap } from "./proteinGap.js";

const prefs = { dietOverride: { diet: "vegetarian" as const, from: "2026-11-05", until: "2026-11-25" }, fastingDays: [], supplements: [{ name: "Whey protein", servings: 1, slot: null }] };
const rules = { diet: "vegetarian" as const, avoid: ["Mushroom"] };

describe("protein the plan can't reach", () => {
  it("averages planned protein over days with no eat-out allowance", () => {
    expect(plannedProtein([{ planned: { proteinG: 106 }, allowances: [] }, { planned: { proteinG: 112 }, allowances: [] }, { planned: { proteinG: 60 }, allowances: [{}] }])).toBe(109);
    expect(plannedProtein([])).toBeNull();
  });

  it("flags a plan below 90% of the target, with the rule that limits it", () => {
    const key = rulesKey(rules as never, prefs as never);
    const cause = gapCause(rules as never, prefs as never);
    expect(cause).toBe("your veg period until 25 Nov");
    const g = proteinGapOf({ plannedG: 109, targetG: 165, stored: null, key, cause });
    expect(g).toMatchObject({ plannedG: 109, targetG: 165, answered: null });
    expect(gapLine(g!)).toMatch(/Not decided yet: this is the plan's limit, not their failure/);
    expect(proteinGapOf({ plannedG: 150, targetG: 165, stored: null, key, cause })).toBeNull();
  });

  it("keeps an answer only while the rules are the same", () => {
    const key = rulesKey(rules as never, prefs as never);
    const stored: StoredGap = { choice: "accept", plannedG: 109, originalTargetG: 165, rulesKey: key, at: "x" };
    // Accepted: the target was lowered to 110, but the gap is still measured against the old one, as answered.
    const g = proteinGapOf({ plannedG: 109, targetG: 110, stored, key, cause: "c" });
    expect(g?.answered?.choice).toBe("accept");
    expect(gapLine(g!)).toMatch(/accepted 110 g/);
    const ended = rulesKey(rules as never, { ...prefs, dietOverride: null } as never);
    expect(ended).not.toBe(key);
    expect(proteinGapOf({ plannedG: 109, targetG: 165, stored, key: ended, cause: "c" })?.answered).toBeNull();
  });

  it("sets an accepted target to the nearest 5 g", () => {
    expect(acceptedTarget(109)).toBe(110);
    expect(acceptedTarget(12)).toBe(40);
  });
});

describe("every plan gap", () => {
  it("flags each target the plan misses, protein included, and hides accepted ones for the same rules", async () => {
    const { planGapsOf, openGaps, plannedAverages, gapsLine } = await import("./proteinGap.js");
    const avg = plannedAverages([{ planned: { kcal: 2150, proteinG: 110, carbsG: 330, fatG: 50, fiberG: 18 }, allowances: [] }, { planned: { kcal: 9999, proteinG: 0, carbsG: 0, fatG: 0 }, allowances: [{}] }]);
    expect(avg).toEqual({ kcal: 2150, proteinG: 110, carbsG: 330, fatG: 50, fiberG: 18 });
    const protein = { plannedG: 110, targetG: 165, cause: "your veg period", answered: null };
    const gaps = planGapsOf(avg, { kcal: 2200, proteinG: 165, carbsG: 250, fatG: 70, fiberG: 30 }, protein);
    expect(gaps.map((g) => `${g.key}:${g.direction}`)).toEqual(["proteinG:under", "carbsG:over", "fatG:under", "fiberG:under"]);
    expect(openGaps(gaps, { keys: ["carbsG", "fatG"], rulesKey: "k", at: "" }, "k").map((g) => g.key)).toEqual(["proteinG", "fiberG"]);
    expect(openGaps(gaps, { keys: ["carbsG"], rulesKey: "old", at: "" }, "k")).toHaveLength(4);
    const line = gapsLine(gaps, protein, "your veg period")!;
    expect(line).toMatch(/Not decided yet/);
    expect(line).toMatch(/carbs about 330 of 250 g/);
  });

  it("skips a target the plan doesn't have (older plans have no fibre)", async () => {
    const { planGapsOf } = await import("./proteinGap.js");
    expect(planGapsOf({ kcal: 2000, proteinG: 150, carbsG: 250, fatG: 60, fiberG: 0 }, { kcal: 2000, proteinG: 150, carbsG: 250, fatG: 60, fiberG: null }, null)).toEqual([]);
  });
});

describe("gapDefaults (recommended by default)", () => {
  const protein = { plannedG: 110, targetG: 165, cause: "your veg period until 25 Nov", answered: null };
  const fibre = { key: "fiberG" as const, label: "Fibre", unit: "g", planned: 20, target: 30, direction: "under" as const };

  it("accepts the plan's protein and keeps the other gaps when nobody has decided", () => {
    expect(gapDefaults({ protein, others: [fibre], key: "k", undone: null })).toEqual({ acceptProtein: true, keepKeys: ["fiberG"] });
  });
  it("leaves an answered protein gap alone", () => {
    const answered = { ...protein, answered: { choice: "supplement" as const, plannedG: 110, originalTargetG: 165, rulesKey: "k", at: "x" } };
    expect(gapDefaults({ protein: answered, others: [], key: "k", undone: null })).toBeNull();
  });
  it("does nothing once they undid the defaults for these rules, and again when the rules change", () => {
    expect(gapDefaults({ protein, others: [fibre], key: "k", undone: "k" })).toBeNull();
    expect(gapDefaults({ protein, others: [fibre], key: "k2", undone: "k" })).not.toBeNull();
  });
  it("tells the coach the target was set by default", () => {
    const g = { ...protein, answered: { choice: "accept" as const, plannedG: 110, originalTargetG: 165, rulesKey: "k", at: "x", auto: true } };
    expect(gapLine(g)).toContain("by default");
  });
});
