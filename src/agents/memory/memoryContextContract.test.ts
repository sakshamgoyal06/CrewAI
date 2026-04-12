import { describe, expect, it } from "vitest";

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
  expect(m).toHaveProperty("semanticRecallAvailable");
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
      semanticRecallAvailable: false,
    };
    assertMemoryContextShape(sample);
  });
});
