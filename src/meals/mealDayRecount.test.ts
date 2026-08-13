import { describe, expect, it } from "vitest";

import {
  buildFullDayMealRecountPlan,
  isFullDayMealRecount,
  splitFullDayMealRecountSegments,
} from "./mealDayRecount.js";

describe("splitFullDayMealRecountSegments", () => {
  it("splits breakfast, lunch, and afternoon tea from a day narrative", () => {
    const segments = splitFullDayMealRecountSegments(
      "For breakfast today i just had a tea\nFor lunch i had 2 plain parathas, boondi raita, and cabbage sabzi\nThen another tea",
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ text: "tea", slot: "breakfast", logKind: "meal" });
    expect(segments[1]).toMatchObject({ slot: "lunch" });
    expect(segments[1]!.text).toContain("parathas");
    expect(segments[2]).toMatchObject({ text: "tea", slot: "snack", logKind: "drink" });
  });

  it("returns empty for a single-meal message", () => {
    expect(splitFullDayMealRecountSegments("log lunch: dal and rice")).toEqual([]);
    expect(isFullDayMealRecount("log lunch: dal and rice")).toBe(false);
    expect(
      splitFullDayMealRecountSegments(
        "I had 2 paratha, bhindi sabji, and boondi raita for lunch",
      ),
    ).toEqual([]);
    expect(
      isFullDayMealRecount("I had 2 paratha, bhindi sabji, and boondi raita for lunch"),
    ).toBe(false);
  });

  it("splits multiple occasions on one line when each starts with For {slot} I had", () => {
    const segments = splitFullDayMealRecountSegments(
      "For breakfast I had tea. For lunch I had 2 parathas and raita",
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ text: "tea", slot: "breakfast" });
    expect(segments[1]).toMatchObject({ slot: "lunch" });
    expect(segments[1]!.text).toContain("parathas");
  });
});

describe("buildFullDayMealRecountPlan", () => {
  it("builds one meal_log step per eating occasion", () => {
    const plan = buildFullDayMealRecountPlan(
      "For breakfast today i just had a tea\nFor lunch i had rice\nThen another tea",
    );
    expect(plan?.steps).toHaveLength(3);
    expect(plan?.steps.every((s) => s.capability === "meal_log")).toBe(true);
    expect(plan?.steps[2]?.args).toMatchObject({ meal_text: "tea", meal_slot: "snack" });
  });
});
