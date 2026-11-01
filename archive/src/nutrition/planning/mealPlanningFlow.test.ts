import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  },
  redis: {},
}));

import { runMealPlanningTurn } from "./mealPlanningFlow.js";

function ctx(raw: string) {
  return {
    userProfileId: "u1",
    telegramUserId: "1",
    timezone: "Asia/Kolkata",
    rawMessage: raw,
    intent: "HEALTH" as const,
  };
}

describe("runMealPlanningTurn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00+05:30"));
    messagesCreate.mockReset();
    sessionState.session = {
      id: "sess-1",
      user_profile_id: "u1",
      status: "gathering",
      step: "constraints",
      horizon_start: "2026-08-09",
      horizon_end: "2026-08-15",
      slots: ["breakfast", "lunch", "dinner"],
      constraints_text: "old notes",
      draft_entries: [],
      draft_display: null,
      revision_notes: null,
      created_at: "",
      updated_at: "",
      expires_at: "",
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes horizon when user restates a longer range at constraints", async () => {
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "prose only, no json" }],
    });

    const out = await runMealPlanningTurn(
      ctx("Tomorrow is Monday. I want a meal plan for next 2 weeks. Help me make the plan"),
      sessionState.session as never,
    );

    expect(sessionState.session?.horizon_start).toBe("2026-08-10");
    expect(sessionState.session?.horizon_end).toBe("2026-08-23");
    expect(out.text).toMatch(/couldn't finish the draft/i);
    expect(out.text).toMatch(/skip/i);
    expect(sessionState.session?.step).toBe("constraints");
  });

  it("cancels without creating a session", async () => {
    sessionState.session = null;
    const out = await runMealPlanningTurn(ctx("cancel planning"), null);
    expect(out.text).toMatch(/cancelled/i);
    expect(out.metadata?.meal_plan_cancelled).toBe(true);
  });

  it("answers review questions without re-posting the full draft", async () => {
    sessionState.session = {
      id: "sess-1",
      user_profile_id: "u1",
      status: "draft",
      step: "review",
      horizon_start: "2026-08-09",
      horizon_end: "2026-08-09",
      slots: ["breakfast", "lunch", "dinner"],
      constraints_text: null,
      draft_entries: [
        { local_date: "2026-08-09", meal_slot: "breakfast", title: "Oats" },
        { local_date: "2026-08-09", meal_slot: "lunch", title: "Dal rice" },
        { local_date: "2026-08-09", meal_slot: "dinner", title: "Paneer stir fry" },
      ],
      draft_display: "**Mon 9 Aug**\n- Breakfast: Oats\n- Lunch: Dal rice\n- Dinner: Paneer stir fry",
      revision_notes: null,
      created_at: "",
      updated_at: "",
      expires_at: "",
    };
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Monday spreads protein well across the three slots." }],
    });

    const out = await runMealPlanningTurn(ctx("Should I swap dinner for fish instead?"), sessionState.session as never);

    expect(out.metadata?.meal_plan_question).toBe(true);
    expect(out.text).toMatch(/Monday spreads protein/i);
    expect(out.text).not.toMatch(/\*\*Mon 9 Aug\*\*/);
    expect(out.text).toMatch(/save plan/i);
  });
});
