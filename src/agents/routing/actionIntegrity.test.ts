import { describe, expect, it } from "vitest";

import {
  classifyToolResult,
  claimsPersistence,
  enforceActionIntegrity,
  stripMisleadingClaimLines,
} from "./actionIntegrity.js";

describe("claimsPersistence", () => {
  it("detects write claims", () => {
    expect(claimsPersistence("Added all 6 to your Magnus Ideas list.")).toBe(true);
    expect(claimsPersistence("Logging the workout in your daily check-in now:")).toBe(true);
    expect(claimsPersistence("Done — AI session logged as skipped.")).toBe(true);
  });

  it("ignores conversational done without persistence", () => {
    expect(claimsPersistence("Cool. This is good.")).toBe(false);
    expect(claimsPersistence("That sounds like a solid plan for Sunday.")).toBe(false);
  });

  it("ignores descriptive meal-plan read text (no false save disclaimer)", () => {
    expect(claimsPersistence("No meal plan saved for 2026-08-09 → 2026-08-15.")).toBe(false);
    expect(claimsPersistence("Here's what tomorrow looks like — nothing scheduled yet.")).toBe(
      false,
    );
    expect(
      enforceActionIntegrity({
        text: "No meal plan saved for this week. Want to draft one?",
        metadata: { specialist: "MealPlanRead", meal_plan: "week" },
      }).corrected,
    ).toBe(false);
  });
});

describe("classifyToolResult", () => {
  it("marks tool errors as failure", () => {
    expect(classifyToolResult("Could not save to watchlist: db error")).toBe(false);
    expect(classifyToolResult("Tool error: timeout")).toBe(false);
  });

  it("marks successful saves as ok", () => {
    expect(classifyToolResult('Added to watchlist: "Dune" id:abc.')).toBe(true);
    expect(classifyToolResult("Logged daily check-in for 2026-08-06 (id:item-1).")).toBe(true);
  });
});

describe("enforceActionIntegrity", () => {
  it("blocks prompt-only specialist write claims", () => {
    const out = enforceActionIntegrity({
      text: "Added all 6 to your Magnus Ideas & Todos list. Full roadmap now at 12 items.",
      metadata: { prompt_only: true, specialist: "Wisdom" },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("prompt_only_claim");
    expect(out.text).toContain("haven't saved anything");
    expect(out.text).not.toMatch(/^Added all 6/i);
  });

  it("blocks health fitness check-in claims without write evidence", () => {
    const out = enforceActionIntegrity({
      text: "Logging the workout in your daily check-in now:\n\n`checkin: 2026-08-06 — Gym done`",
      metadata: { specialist: "Fitness", health_order: "fitness" },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("no_write_evidence");
    expect(out.text).toContain("haven't actually saved");
    expect(out.text).not.toContain("`checkin:");
  });

  it("allows Magnus replies when a write tool succeeded", () => {
    const out = enforceActionIntegrity({
      text: "Done — **Die With Zero** is on your readlist.",
      metadata: {
        tools_used: ["add_list_item"],
        tool_outcomes: [{ name: "add_list_item", ok: true, preview: "Added to readlist" }],
      },
    });
    expect(out.corrected).toBe(false);
    expect(out.text).toContain("readlist");
  });

  it("corrects Magnus when claiming save but no tools ran", () => {
    const out = enforceActionIntegrity({
      text: "Logged your gym session in daily check-ins.",
      metadata: { specialist: "Magnus", pillar: "magnus" },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("no_write_evidence");
  });

  it("warns on partial tool failure when some writes succeeded", () => {
    const out = enforceActionIntegrity({
      text: "Added to watchlist and mirrored to Notion.",
      metadata: {
        tools_used: ["add_list_item", "add_list_item"],
        tool_outcomes: [
          { name: "add_list_item", ok: true, preview: "Added" },
          { name: "add_list_item", ok: false, preview: "Could not save" },
        ],
      },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("partial_write_failure");
  });

  it("downgrades overconfident replies after tool limit", () => {
    const out = enforceActionIntegrity({
      text: "All done — wisdom playlist is now clean at 6 videos.",
      metadata: { tool_limit: true, tools_used: ["youtube_playlist"] },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("tool_limit_partial");
    expect(out.text).toContain("partway through");
  });

  it("does not rewrite meal plan draft review replies", () => {
    const out = enforceActionIntegrity({
      text: "Good catch — curd added wherever possible for protein.\n\n**Draft plan** for the week.",
      metadata: {
        specialist: "MealPlanner",
        meal_plan_status: "draft",
        meal_plan_revised: true,
      },
    });
    expect(out.corrected).toBe(false);
    expect(out.text).toContain("curd added");
  });
});

describe("stripMisleadingClaimLines", () => {
  it("removes fake check-in blocks", () => {
    const cleaned = stripMisleadingClaimLines(
      "Solid session.\n\nLogging now:\n\n`checkin: gym done`\n\nSee you tomorrow.",
    );
    expect(cleaned).not.toContain("`checkin:");
    expect(cleaned).toContain("Solid session");
    expect(cleaned).toContain("See you tomorrow");
  });
});
