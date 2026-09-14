import { describe, expect, it } from "vitest";

import {
  isDepartmentId,
  isPillar,
  pillarForDepartment,
} from "./pillarTypes.js";

describe("pillarTypes", () => {
  it("narrows Pillar", () => {
    expect(isPillar("health")).toBe(true);
    expect(isPillar("wealth")).toBe(true);
    expect(isPillar("wisdom")).toBe(true);
    expect(isPillar("joy")).toBe(true);
    expect(isPillar("not_a_pillar")).toBe(false);
  });

  it("narrows DepartmentId", () => {
    expect(isDepartmentId("nutrition")).toBe(true);
    expect(isDepartmentId("fire_independence_goals")).toBe(true);
    expect(isDepartmentId("unknown_dept")).toBe(false);
  });

  it("maps department to pillar", () => {
    expect(pillarForDepartment("workouts")).toBe("health");
    expect(pillarForDepartment("investment")).toBe("wealth");
    expect(pillarForDepartment("build_ship")).toBe("wisdom");
    expect(pillarForDepartment("culture_leisure")).toBe("joy");
  });
});
