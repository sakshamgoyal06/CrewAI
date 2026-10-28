import { describe, expect, it } from "vitest";
import { inferThemeFromMessage, getProjectTheme } from "./themes/index.js";
import { formatActiveProjectsForMemory } from "./projectStore.js";

describe("project themes", () => {
  it("infers job_search from message", () => {
    expect(inferThemeFromMessage("starting my job search for PM roles")).toBe("job_search");
  });

  it("infers trip_plan from vacation message", () => {
    expect(inferThemeFromMessage("planning a trip to Bali")).toBe("trip_plan");
  });

  it("custom theme has empty checklist", () => {
    expect(getProjectTheme("custom").defaultChecklist).toEqual([]);
  });
});

describe("formatActiveProjectsForMemory", () => {
  it("formats active projects block", () => {
    const block = formatActiveProjectsForMemory([
      {
        id: "p1",
        title: "Job search",
        outcome: "Offer signed",
        target_date: "2026-06-01",
        status: "active",
        project_type: "job_search",
        priority_rank: 1,
        energy_budget: "high",
        open_checklist_count: 2,
        next_checklist_item: "Update resume",
      },
    ]);
    expect(block).toContain("Job search");
    expect(block).toContain("Update resume");
  });
});
