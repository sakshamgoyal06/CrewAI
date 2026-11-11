import { describe, expect, it } from "vitest";

import { acceptedTarget, gapCause, gapLine, plannedProtein, proteinGapOf, rulesKey, type StoredGap } from "./proteinGap.js";

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
