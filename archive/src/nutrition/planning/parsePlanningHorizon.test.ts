import { describe, expect, it } from "vitest";

import { parsePlanningHorizon, parsePlanningStartAnchor } from "./parsePlanningHorizon.js";
import { parsePlanningSlots, formatSlotsLabel } from "./parsePlanningSlots.js";

describe("parsePlanningHorizon", () => {
  const today = "2026-08-09";

  it("parses today", () => {
    expect(parsePlanningHorizon("plan meals for today", today)).toEqual({
      startDate: today,
      endDate: today,
      label: "today",
    });
  });

  it("parses this week as 7 days from today", () => {
    const h = parsePlanningHorizon("meal plan for the week", today);
    expect(h?.startDate).toBe(today);
    expect(h?.endDate).toBe("2026-08-15");
  });

  it("does not treat 2-week meal plan as this week", () => {
    const h = parsePlanningHorizon("Create a new 2-week meal plan starting Monday", today);
    expect(h?.startDate).toBe("2026-08-10");
    expect(h?.endDate).toBe("2026-08-23");
    expect(h?.label).toContain("2 week");
  });

  it("parses next 2 weeks from tomorrow when user says tomorrow is Monday", () => {
    const h = parsePlanningHorizon(
      "Tomorrow is Monday. I want to make meal plan for next 2 weeks. Help me make the plan",
      today,
    );
    expect(h?.startDate).toBe("2026-08-10");
    expect(h?.endDate).toBe("2026-08-23");
  });

  it("parses explicit date range", () => {
    const h = parsePlanningHorizon("2026-08-10 to 2026-08-12", today);
    expect(h).toEqual({
      startDate: "2026-08-10",
      endDate: "2026-08-12",
      label: "2026-08-10 → 2026-08-12",
    });
  });

  it("parsePlanningStartAnchor prefers tomorrow when user says tomorrow is Monday", () => {
    expect(parsePlanningStartAnchor("tomorrow is Monday, plan meals", today)).toBe("2026-08-10");
  });
});

describe("parsePlanningSlots", () => {
  it("parses dinners only", () => {
    expect(parsePlanningSlots("dinners only please")).toEqual(["dinner"]);
  });

  it("returns null when unclear", () => {
    expect(parsePlanningSlots("high protein")).toBeNull();
  });

  it("formatSlotsLabel joins slots", () => {
    expect(formatSlotsLabel(["breakfast", "dinner"])).toBe("Breakfast, Dinner");
  });
});
