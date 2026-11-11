import { describe, expect, it } from "vitest";

import { focusContext, focusWeight, gapUndecided, NO_FOCUS_CONTEXT, pickFocus } from "./focus.js";

const day = (miss: Record<string, number>, extra: { unlogged?: boolean; partial?: boolean } = {}) => ({
  ...extra,
  checks: ["calories", "protein", "steps"].map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), met: !(id in miss), progress: miss[id] ?? 1 })),
});

describe("pickFocus", () => {
  it("raises nothing when nothing was missed twice", () => {
    expect(pickFocus([day({}), day({ steps: 0.5 }), day({})], NO_FOCUS_CONTEXT)).toBeNull();
  });

  it("doesn't count unlogged or partly logged days as food misses", () => {
    const days = [day({ protein: 0 }, { unlogged: true }), day({ protein: 0.2 }, { partial: true }), day({ protein: 0.6 }), day({ steps: 0.5 }), day({ steps: 0.5 })];
    expect(pickFocus(days, NO_FOCUS_CONTEXT)?.id).toBe("steps");
  });

  it("drops protein when the meal plan can't reach it, and favours calories when weight is behind", () => {
    const days = [day({ protein: 0.6, calories: 0.8 }), day({ protein: 0.6, calories: 0.8 }), day({ protein: 0.6 })];
    expect(pickFocus(days, NO_FOCUS_CONTEXT)?.id).toBe("protein");
    expect(pickFocus(days, { proteinPlanShort: true, weightBehind: false })?.id).toBe("calories");
    expect(pickFocus(days.slice(0, 2), { proteinPlanShort: false, weightBehind: true })?.id).toBe("calories");
  });

  it("marks a miss on most logged days as a pattern", () => {
    const f = pickFocus([day({ steps: 0.3 }), day({ steps: 0.3 }), day({ steps: 0.3 }), day({})], NO_FOCUS_CONTEXT);
    expect(f).toMatchObject({ id: "steps", missedDays: 3, judgedDays: 4, pattern: true });
  });
});

describe("focus context", () => {
  it("reads pace and the plan gap", () => {
    expect(focusContext({ metrics: [{ metric: "weight_kg", pace: "behind" }] } as never, true)).toEqual({ proteinPlanShort: true, weightBehind: true });
    expect(gapUndecided("… Not decided yet: this is the plan's limit")).toBe(true);
    expect(gapUndecided("… They accepted 110 g")).toBe(false);
    expect(focusWeight("protein", 3, { proteinPlanShort: true, weightBehind: false })).toBe(0);
  });
});
