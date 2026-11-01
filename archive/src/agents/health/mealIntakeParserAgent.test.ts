import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

vi.mock("../../tools/routingContext.js", () => ({
  fetchRecentRoutingTurns: vi.fn().mockResolvedValue([]),
}));

import { parseMealIntakeFromMessage } from "./mealIntakeParserAgent.js";

describe("parseMealIntakeFromMessage", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  const ctx = {
    userProfileId: "u1",
    telegramUserId: "t1",
    rawMessage: "I had 2 paratha, bhindi sabji, and boondi raita for lunch",
    intent: "HEALTH" as const,
  };

  it("returns one lunch meal from intake parser (not split on trailing for lunch)", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            replace_today_log: false,
            meals: [
              {
                meal_slot: "lunch",
                log_kind: "meal",
                meal_text: "2 paratha, bhindi sabji, and boondi raita",
                components: [
                  { user_label: "paratha", api_query: "2 medium wheat paratha" },
                  { user_label: "bhindi sabji", api_query: "150g bhindi sabji" },
                  { user_label: "boondi raita", api_query: "100g boondi raita" },
                ],
              },
            ],
          }),
        },
      ],
    });

    const result = await parseMealIntakeFromMessage(ctx);
    expect(result?.meals).toHaveLength(1);
    expect(result?.meals[0]?.mealSlot).toBe("lunch");
    expect(result?.meals[0]?.components).toHaveLength(3);
    expect(result?.replaceTodayLog).toBe(false);
  });

  it("supports multi-meal day recount with replace_today_log", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            replace_today_log: true,
            meals: [
              {
                meal_slot: "breakfast",
                log_kind: "meal",
                meal_text: "tea",
                components: [{ user_label: "tea", api_query: "1 cup chai tea" }],
              },
              {
                meal_slot: "lunch",
                log_kind: "meal",
                meal_text: "2 parathas and raita",
                components: [
                  { user_label: "paratha", api_query: "2 medium paratha" },
                  { user_label: "raita", api_query: "100g boondi raita" },
                ],
              },
            ],
          }),
        },
      ],
    });

    const result = await parseMealIntakeFromMessage({
      ...ctx,
      rawMessage:
        "For breakfast today i just had a tea\nFor lunch i had 2 plain parathas and boondi raita",
    });
    expect(result?.replaceTodayLog).toBe(true);
    expect(result?.meals).toHaveLength(2);
  });

  it("falls back to single past-meal extraction when LLM JSON is invalid", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
    });

    const result = await parseMealIntakeFromMessage(ctx);
    expect(result?.parser).toBe("fallback");
    expect(result?.meals).toHaveLength(1);
    expect(result?.meals[0]?.mealText).toContain("paratha");
  });
});
