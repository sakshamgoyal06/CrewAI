import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tools/clients.js", () => ({
  supabase: { from: vi.fn() },
  anthropic: {},
  redis: {},
}));

import { supabase } from "../../tools/clients.js";
import { loadMemoryContext } from "./memoryAgent.js";

describe("loadMemoryContext", () => {
  const from = vi.mocked(supabase.from);

  beforeEach(() => {
    process.env.MAGNUS_LIFEOS_CONTEXT_ENABLED = "true";
    from.mockReset();
    from.mockImplementation((table: string) => {
      switch (table) {
        case "user_profile":
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      north_star_goal: "Ship Magnus",
                      timezone: "Asia/Kolkata",
                      user_tier: "standard",
                    },
                    error: null,
                  }),
              }),
            }),
          };
        case "magnus_chat_messages":
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            role: "user",
                            content: "hello",
                            intent: "GENERAL",
                            created_at: "2026-04-01T12:00:00Z",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        case "goals":
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [
                        {
                          id: "g1",
                          title: "Lift 3x",
                          pillar: "health",
                          status: "active",
                          timeframe: "weekly",
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          };
        case "happiness_reserve":
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: { tank_level: 72, happiness_score: 72 },
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        case "memory_summaries":
        case "daily_scores":
        case "magnus_daily_logs":
        case "patterns":
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [],
                      error: null,
                    }),
                }),
              }),
            }),
          };
        default:
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
                limit: () => Promise.resolve({ data: [], error: null }),
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
      }
    });
  });

  it("returns MemoryContext with profile, chat, goals, joy when mocks succeed", async () => {
    const ctx = await loadMemoryContext({
      userProfileId: "00000000-0000-0000-0000-000000000099",
      telegramUserId: "12345",
      purpose: "chat",
      deps: { supabase },
    });

    expect(ctx.purpose).toBe("chat");
    expect(ctx.profile?.northStarGoal).toBe("Ship Magnus");
    expect(ctx.recentSignals.recentChatTurns).toHaveLength(1);
    expect(ctx.recentSignals.recentChatTurns[0]?.role).toBe("user");
    expect(ctx.activeGoals[0]?.label).toBe("Lift 3x");
    expect(ctx.joy.summary).toMatch(/72/);
    expect(ctx.gaps.length).toBeGreaterThan(0);
  });

  it("records gaps when optional tables are empty or missing", async () => {
    const ctx = await loadMemoryContext({
      userProfileId: "00000000-0000-0000-0000-000000000099",
      telegramUserId: "12345",
      purpose: "chat",
      deps: { supabase },
    });
    expect(ctx.gaps.some((g) => g.includes("memory_summaries"))).toBe(true);
    expect(ctx.gaps.some((g) => g.includes("daily_scores"))).toBe(true);
    expect(ctx.gaps.some((g) => g.includes("magnus_daily_logs"))).toBe(true);
  });
});

