import { describe, expect, it } from "vitest";

import { formatMemoryBlockForSystem } from "./format.js";
import { memoryConfig, resetMemoryConfigForTests } from "./memoryConfig.js";
import { selectContextSlice } from "./selectContextSlice.js";
import type { MemoryContext } from "./types.js";

/**
 * Contract: MemoryContext must keep these keys so orchestrator + agents can rely on shape.
 */
function assertMemoryContextShape(m: MemoryContext): void {
  expect(m).toHaveProperty("purpose");
  expect(m).toHaveProperty("loadedAt");
  expect(m).toHaveProperty("profile");
  expect(m).toHaveProperty("recentSignals");
  expect(m.recentSignals).toHaveProperty("recentChatTurns");
  expect(m).toHaveProperty("rollingSummaries");
  expect(m).toHaveProperty("activeGoals");
  expect(m).toHaveProperty("joy");
  expect(m).toHaveProperty("patterns");
  expect(m).toHaveProperty("gaps");
  expect(Array.isArray(m.gaps)).toBe(true);
  expect(Array.isArray(m.activeGoals)).toBe(true);
  expect(Array.isArray(m.patterns)).toBe(true);
  expect(Array.isArray(m.recentSignals.recentChatTurns)).toBe(true);
}

describe("MemoryContext contract", () => {
  it("accepts a minimal valid object", () => {
    const sample: MemoryContext = {
      purpose: "chat",
      loadedAt: new Date().toISOString(),
      profile: { northStarGoal: "x", timezone: "UTC", userTier: "standard" },
      recentSignals: {
        recentChatTurns: [
          {
            role: "user",
            content: "hi",
            intent: "GENERAL",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        dailyScores: [{ date: "2026-01-01" }],
      },
      rollingSummaries: { summary7d: "week", summary30d: "month" },
      activeGoals: [{ id: "1", label: "Goal" }],
      joy: { summary: "ok", happinessReserve: { tank_level: 50 } },
      patterns: [{ name: "p" }],
      gaps: ["optional_table: missing"],
    };
    assertMemoryContextShape(sample);
  });
});

function fixtureMemoryContext(): MemoryContext {
  return {
    purpose: "chat",
    loadedAt: new Date().toISOString(),
    profile: {
      displayName: "Alex",
      northStarGoal: "Ship Magnus v1",
      timezone: "Asia/Kolkata",
      userTier: "standard",
    },
    recentSignals: {
      recentChatTurns: Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Turn ${i} — calendar and list context filler `.repeat(8),
        intent: "GENERAL",
        createdAt: new Date().toISOString(),
      })),
      events: [
        {
          title: "Dentist",
          status: "planned",
          plannedStartAt: "2026-09-07T10:00:00Z",
          timeZone: "Asia/Kolkata",
          allDay: false,
          moves: 0,
        },
      ],
      dailyLogs: [
        {
          body: "Worked on Magnus accuracy plan ".repeat(20),
          logDate: "2026-09-06",
          createdAt: new Date().toISOString(),
        },
      ],
    },
    rollingSummaries: {
      summary7d: "Busy week with calendar changes ".repeat(30),
      summary30d: "Month overview ".repeat(40),
    },
    activeGoals: [{ id: "1", label: "Launch v1" }],
    joy: { summary: "Joy tank ok" },
    patterns: [{ name: "morning gym" }],
    lists: {
      notionConnected: false,
      catalog: [{ slug: "tasks", openCount: 3, notionLinked: false }],
      openHighlights: [{ slug: "tasks", title: "Fix tests", status: "open" }],
    },
    gaps: [],
  };
}

describe("context slice matrix (Step 1)", () => {
  it("calendar/list GENERAL turns keep memory block under 3.5KB", () => {
    resetMemoryConfigForTests();
    const ctx = fixtureMemoryContext();
    const profile = selectContextSlice({
      intent: "GENERAL",
      rawMessage: "what's on my calendar tomorrow?",
      config: memoryConfig(),
    });

    const block = formatMemoryBlockForSystem(ctx, profile, {
      topicIndexLines: ["- Prefers morning workouts", "- Timezone Asia/Kolkata"],
      omitChatSnippets: true,
    });

    expect(block.length).toBeLessThanOrEqual(3500);
    expect(profile.verbatimTurnLimit).toBeLessThanOrEqual(8);
    expect(block).toContain("Memory topics (index");
  });

  it("HEALTH fitness turn excludes daily logs in profile", () => {
    const profile = selectContextSlice({
      intent: "HEALTH",
      rawMessage: "log bench press 80kg",
      config: memoryConfig(),
    });
    expect(profile.includeDailyLogs).toBe(false);
  });
});
