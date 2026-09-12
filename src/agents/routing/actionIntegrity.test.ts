import { describe, expect, it } from "vitest";

import {
  classifyToolResult,
  claimsPersistence,
  enforceActionIntegrity,
  mentionsVagueFailure,
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

  it("ignores already-on-list replies without a new write", () => {
    expect(
      claimsPersistence(
        "Musafir Cafe is already on your watchlist! Added it at some point previously — no duplicates needed.",
      ),
    ).toBe(false);
    const out = enforceActionIntegrity({
      text: "Added Musafir Cafe to your watchlist.\n\nMusafir Cafe is already on your watchlist — no duplicates needed.",
      metadata: {
        specialist: "Magnus",
        pillar_capability: "lists",
        pillar_step_results: [
          {
            step_index: 0,
            capability: "lists",
            preview:
              "Musafir Cafe is already on your watchlist! Added it at some point previously — no duplicates needed.",
          },
        ],
      },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("stripped_false_add_line");
    expect(out.text).not.toContain("haven't actually saved");
    expect(out.text).toContain("already on your watchlist");
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

  it("does not rewrite project setup draft replies when session was persisted", () => {
    const out = enforceActionIntegrity({
      text: "Hey! I've set up your job search project. Reply **lock it in** to start.",
      metadata: {
        specialist: "Magnus",
        project_setup: true,
        project_setup_draft: true,
        project_session_id: "24922aad-e0eb-4ad2-80cc-9d7d85551be1",
        pillar_capability: "project_setup",
      },
    });
    expect(out.corrected).toBe(false);
    expect(out.text).not.toContain("haven't actually saved");
  });

  it("allows project lock claims when project_locked metadata is present", () => {
    const out = enforceActionIntegrity({
      text: "Locked **Job search**. Done when: Offer signed.",
      metadata: {
        specialist: "Magnus",
        project_setup: true,
        project_locked: true,
        project_id: "abc-123",
      },
    });
    expect(out.corrected).toBe(false);
  });

  it("blocks meal log claims without meal_session_id", () => {
    const out = enforceActionIntegrity({
      text: "Got it! I've logged your full day: breakfast, lunch, and dinner.",
      metadata: { specialist: "nutrition", meal_log: true, department: "HEALTH" },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("no_write_evidence");
  });

  it("allows meal log claims when meal_session_id is present", () => {
    const out = enforceActionIntegrity({
      text: "Lunch logged — 408 kcal.",
      metadata: {
        specialist: "nutrition",
        meal_log: true,
        meal_session_id: "abc-123",
      },
    });
    expect(out.corrected).toBe(false);
  });

  it("softens calendar sync claims without calendar tool evidence", () => {
    const out = enforceActionIntegrity({
      text: "Done! Calendar event is live for November 10.",
      metadata: { specialist: "Magnus", tools_used: ["update_event"] },
    });
    expect(out.corrected).toBe(true);
    expect(out.reason).toBe("calendar_claim_without_sync");
    expect(out.text).not.toMatch(/calendar event is live/i);
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

// "There's a backend hiccup" is not a thing this system can produce. When the model says it,
// the user is left unable to tell what broke — and the reply escapes the write-claim checks
// precisely because it admits failure.
describe("mentionsVagueFailure", () => {
  it("recognises invented causes", () => {
    expect(mentionsVagueFailure("There's a backend hiccup preventing me from saving it")).toBe(true);
    expect(mentionsVagueFailure("Something went wrong on my end")).toBe(true);
    expect(mentionsVagueFailure("The tasks tool is acting up")).toBe(true);
    expect(mentionsVagueFailure("I'm having trouble saving that")).toBe(true);
    expect(mentionsVagueFailure("I can't save this right now")).toBe(true);
  });

  it("leaves real, specific explanations alone", () => {
    expect(mentionsVagueFailure('add_list_item returned "Unknown list \\"holiday\\""')).toBe(false);
    expect(mentionsVagueFailure("Google Calendar is not connected — here is the consent link")).toBe(
      false,
    );
    expect(mentionsVagueFailure("Added 13 to tasks.")).toBe(false);
  });
});

describe("enforceActionIntegrity — euphemised tool failures", () => {
  const failedAdd = {
    tool_outcomes: [
      {
        name: "add_list_item",
        ok: false,
        preview: 'Could not save to tasks: permission denied for table magnus_list_items',
      },
    ],
  };

  it("replaces the invented cause with the real tool error and keeps the content", () => {
    const result = enforceActionIntegrity({
      text: "There's a backend hiccup preventing me from saving it to your tasks tool right now, but here's everything organized:\n\n1. Book cab\n2. Pack bags",
      metadata: failedAdd,
    });

    expect(result.corrected).toBe(true);
    expect(result.reason).toBe("euphemised_tool_failure");
    expect(result.text).not.toMatch(/hiccup/i);
    expect(result.text).toContain("Nothing was saved.");
    expect(result.text).toContain("add_list_item");
    expect(result.text).toContain("permission denied");
    expect(result.text).toContain("Book cab");
    expect(result.text).toContain("Pack bags");
  });

  it("tells the user why when a write claim had no evidence and a tool really failed", () => {
    const result = enforceActionIntegrity({
      text: "Added all 13 items to your tasks list.",
      metadata: failedAdd,
    });

    expect(result.corrected).toBe(true);
    expect(result.text).toContain("I haven't actually saved that yet.");
    expect(result.text).toContain("permission denied");
    expect(result.text).not.toContain("Tell me again in one message");
  });

  it("does not fire when the write actually succeeded", () => {
    const result = enforceActionIntegrity({
      text: "Added 13 to tasks.",
      metadata: {
        tool_outcomes: [{ name: "add_list_items", ok: true, preview: "Added 13 to tasks: ..." }],
      },
    });

    expect(result.corrected).toBe(false);
    expect(result.text).toBe("Added 13 to tasks.");
  });

  it("leaves an honest, specific failure explanation untouched", () => {
    const text =
      'add_list_item came back with "Unknown list \\"holiday\\"". Nothing saved — want me to create that list first?';
    const result = enforceActionIntegrity({ text, metadata: failedAdd });

    expect(result.reason).not.toBe("euphemised_tool_failure");
    expect(result.text).toContain("Unknown list");
  });
});
