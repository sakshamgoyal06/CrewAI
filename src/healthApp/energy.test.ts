import { describe, expect, it } from "vitest";
import { bmrOf, totalBurnForDay } from "./energy.js";
import { calorieFloor } from "./interventions/engine.js";

const me = { sex: "male", birthYear: 1994, heightCm: 178 };

describe("bmrOf", () => {
  it("is Mifflin-St Jeor at the given weight", () => {
    // 10·86 + 6.25·178 − 5·32 + 5
    expect(bmrOf(me, 86, "2026-11-11")).toBe(1818);
    expect(bmrOf({ sex: "female", birthYear: 1994, heightCm: 165 }, 60, "2026-11-11")).toBe(1310);
  });
  it("needs sex, birth year, height and a weight", () => {
    expect(bmrOf({ ...me, heightCm: null }, 86, "2026-11-11")).toBeNull();
    expect(bmrOf(me, null, "2026-11-11")).toBeNull();
  });
  it("matches the calorie floor's BMR", () => {
    expect(calorieFloor(me, 86, "2026-11-11").bmr).toBe(bmrOf(me, 86, "2026-11-11"));
  });
});

describe("totalBurnForDay", () => {
  it("adds a full day's BMR to active burn for a past day", () => {
    expect(totalBurnForDay({ bmr: 1800, activeKcal: 420, phoneTotalKcal: null, isToday: false, dayShare: 0.3 }))
      .toEqual({ kcal: 2220, restingKcal: 1800, activeKcal: 420, source: "estimate", soFar: false });
  });
  it("counts only the part of today that has passed", () => {
    expect(totalBurnForDay({ bmr: 1800, activeKcal: 100, phoneTotalKcal: null, isToday: true, dayShare: 0.5 }))
      .toMatchObject({ kcal: 1000, restingKcal: 900, soFar: true });
  });
  it("prefers the phone's total", () => {
    expect(totalBurnForDay({ bmr: 1800, activeKcal: 300, phoneTotalKcal: 2350, isToday: false, dayShare: 0 }))
      .toEqual({ kcal: 2350, restingKcal: null, activeKcal: 300, source: "phone", soFar: false });
  });
  it("is null with nothing to go on", () => {
    expect(totalBurnForDay({ bmr: null, activeKcal: 300, phoneTotalKcal: null, isToday: false, dayShare: 0 })).toBeNull();
  });
});
