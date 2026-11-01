import { afterEach, describe, expect, it } from "vitest";

import { memoryConfig, resetMemoryConfigForTests } from "./memoryConfig.js";
import { isGeneralFocusedToolTurn, selectContextSlice } from "./selectContextSlice.js";

describe("selectContextSlice", () => {
  afterEach(() => {
    delete process.env.MAGNUS_MEMORY_GENERAL_VERBATIM_TURNS;
    delete process.env.MAGNUS_MEMORY_TOPIC_INDEX_ONLY;
    delete process.env.MAGNUS_MINIMAL_MODE;
    resetMemoryConfigForTests();
  });

  it("caps verbatim turns and memory block for GENERAL calendar turns", () => {
    process.env.MAGNUS_MEMORY_GENERAL_VERBATIM_TURNS = "8";
    process.env.MAGNUS_MEMORY_TOPIC_INDEX_ONLY = "true";
    resetMemoryConfigForTests();

    const profile = selectContextSlice({
      intent: "GENERAL",
      rawMessage: "what's on my calendar tomorrow?",
      config: memoryConfig(),
    });

    expect(profile.verbatimTurnLimit).toBeLessThanOrEqual(8);
    expect(profile.memoryBlockMaxChars).toBeLessThanOrEqual(3500);
    expect(profile.includeDailyScores).toBe(false);
    expect(profile.includePatterns).toBe(false);
    expect(profile.includeTopicIndexOnly).toBe(true);
  });

  it("caps verbatim turns for list-focused GENERAL turns", () => {
    process.env.MAGNUS_MEMORY_GENERAL_VERBATIM_TURNS = "8";
    resetMemoryConfigForTests();

    const profile = selectContextSlice({
      intent: "GENERAL",
      rawMessage: "recommend dinner from my food list",
      config: memoryConfig(),
    });

    expect(isGeneralFocusedToolTurn("recommend dinner from my food list")).toBe(true);
    expect(profile.verbatimTurnLimit).toBeLessThanOrEqual(8);
    expect(profile.includeRollingSummaries).toBe(false);
  });

  it("trims joy and patterns for minimal-mode GENERAL", () => {
    process.env.MAGNUS_MEMORY_TOPIC_INDEX_ONLY = "true";
    resetMemoryConfigForTests();

    const profile = selectContextSlice({
      intent: "GENERAL",
      rawMessage: "how was my day?",
      config: memoryConfig(),
      minimalMode: true,
    });

    expect(profile.includeDailyScores).toBe(false);
    expect(profile.includePatterns).toBe(false);
    expect(profile.includeJoy).toBe(false);
    expect(profile.includeTopicIndexOnly).toBe(true);
  });

  it("trims goals and daily logs for minimal-mode HEALTH", () => {
    const profile = selectContextSlice({
      intent: "HEALTH",
      rawMessage: "log my workout",
      config: memoryConfig(),
      minimalMode: true,
    });

    expect(profile.includeJoy).toBe(false);
    expect(profile.includeGoals).toBe(false);
    expect(profile.includeDailyLogs).toBe(false);
  });
});
