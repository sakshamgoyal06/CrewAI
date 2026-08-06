import { describe, expect, it } from "vitest";

import { looksLikeMagnusToolAction } from "./magnusActionDetect.js";

describe("looksLikeMagnusToolAction", () => {
  it("detects list catalog and watchlist reads", () => {
    expect(looksLikeMagnusToolAction("what's on my watchlist")).toBe(true);
    expect(looksLikeMagnusToolAction("list_catalog")).toBe(true);
    expect(looksLikeMagnusToolAction("add Dune to readlist")).toBe(true);
  });

  it("detects recommend from saved list", () => {
    expect(
      looksLikeMagnusToolAction("recommend a short thriller from my watchlist"),
    ).toBe(true);
  });

  it("detects LifeOS writers", () => {
    expect(looksLikeMagnusToolAction("log joy tank 72")).toBe(true);
    expect(looksLikeMagnusToolAction("health pillar is at_risk today")).toBe(true);
    expect(looksLikeMagnusToolAction("add goal: save 20% monthly")).toBe(true);
  });

  it("detects Notion connect/sync", () => {
    expect(looksLikeMagnusToolAction("connect notion")).toBe(true);
    expect(looksLikeMagnusToolAction("sync supabase to notion")).toBe(true);
  });

  it("detects daily check-in writes", () => {
    expect(looksLikeMagnusToolAction("log this in my daily checkins")).toBe(true);
    expect(looksLikeMagnusToolAction("save today's check-in")).toBe(true);
    expect(
      looksLikeMagnusToolAction("I am done with the workout. Read hevy, review, and log"),
    ).toBe(true);
    expect(looksLikeMagnusToolAction("log that i did the workout in my daily check ins")).toBe(
      true,
    );
  });

  it("does not steal pure taste talk", () => {
    expect(looksLikeMagnusToolAction("recommend a film like Arrival")).toBe(false);
    expect(looksLikeMagnusToolAction("should I train legs today?")).toBe(false);
  });

  it("defers to youtube detector (no double match needed)", () => {
    expect(looksLikeMagnusToolAction("search YouTube for jazz")).toBe(false);
  });
});
