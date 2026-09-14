import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
const sessionState = {
  session: null as Record<string, unknown> | null,
};

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
    },
  },
  supabase: {
    from: (table: string) => {
      if (table === "meal_plan_sessions") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: sessionState.session, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => {
                sessionState.session = {
                  id: "sess-1",
                  user_profile_id: "u1",
                  status: "gathering",
                  step: "horizon",
                  horizon_start: null,
                  horizon_end: null,
                  slots: ["breakfast", "lunch", "dinner"],
                  constraints_text: null,
                  draft_entries: [],
                  draft_display: null,
                  revision_notes: null,
                  created_at: "",
                  updated_at: "",
                  expires_at: "",
                };
                return { data: sessionState.session, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              if (sessionState.session) {
                sessionState.session = { ...sessionState.session, ...payload };
              }
              return { error: null };
            },
          }),
        };
      }
      if (table === "user_health_profile") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "meal_plan_entries") {
        return {
          delete: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) }),
          insert: async () => ({ error: null }),
        };
      }
      return {};
    },
  },
  redis: {},
}));

import { tryMealPlanningAgent } from "./mealPlanningAgent.js";

function ctx(raw: string) {
  return {
    userProfileId: "u1",
    telegramUserId: "1",
    timezone: "UTC",
    rawMessage: raw,
    intent: "HEALTH" as const,
  };
}

describe("tryMealPlanningAgent", () => {
  beforeEach(() => {
    sessionState.session = null;
    messagesCreate.mockReset();
  });

  it("returns null for non-planning messages without active session", async () => {
    const out = await tryMealPlanningAgent(ctx("how much protein today"));
    expect(out).toBeNull();
  });

  it("starts planning flow and asks for horizon", async () => {
    const out = await tryMealPlanningAgent(ctx("meal plan please"));
    expect(out?.text).toContain("How long");
    expect(out?.metadata?.meal_plan_step).toBe("horizon");
  });

  it("continues active session on follow-up", async () => {
    sessionState.session = {
      id: "sess-1",
      user_profile_id: "u1",
      status: "gathering",
      step: "slots",
      horizon_start: "2026-08-09",
      horizon_end: "2026-08-15",
      slots: ["breakfast", "lunch", "dinner"],
      constraints_text: null,
      draft_entries: [],
      draft_display: null,
      revision_notes: null,
    };

    const out = await tryMealPlanningAgent(ctx("skip"));
    expect(out?.text).toContain("Anything special");
    expect(sessionState.session?.step).toBe("constraints");
  });
});
