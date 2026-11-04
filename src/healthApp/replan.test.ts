import { describe, expect, it } from "vitest";
import { goalChanges, replanLines } from "./replan.js";

const goal = (deadline: string, w = 70) => ({ id: "g", startDate: "2026-11-01", deadline, targets: { weight_kg: w } });

describe("goalChanges", () => {
  it("lists a moved date and target", () => {
    const c = goalChanges(goal("2027-03-01"), goal("2027-05-01", 68));
    expect(c.map((x) => x.label)).toEqual(["Goal date", "Target weight"]);
    expect(c[0]).toMatchObject({ from: "1 Mar 2027", to: "1 May 2027" });
  });
  it("is empty when nothing moved", () => {
    expect(goalChanges(goal("2027-03-01"), goal("2027-03-01"))).toEqual([]);
  });
});

describe("replanLines", () => {
  const base = { deadline: "2027-03-01", targetWeightKg: 70, weeksLeft: 17, from: 2000, to: 1800, plannedKgPerWeek: -0.5, neededKgPerWeek: -0.5, capped: false, safeDate: null };
  it("states the new target and pace", () => {
    const l = replanLines(base);
    expect(l[0]).toContain("reaches 70 kg by 1 Mar 2027");
    expect(l[1]).toContain("down from 2,000 kcal to 1,800 kcal");
  });
  it("warns first when the pace is unsafe", () => {
    const l = replanLines({ ...base, capped: true, neededKgPerWeek: -1.4, safeDate: "2027-06-01" });
    expect(l[0]).toContain("faster than is safe");
    expect(l[0]).toContain("1 Jun 2027");
  });
  it("leaves a target that still fits", () => {
    expect(replanLines({ ...base, to: 2020 })[1]).toContain("still fits");
  });
});
