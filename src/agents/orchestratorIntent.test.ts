import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/clients.js", () => ({
  anthropic: { messages: { create: createMock } },
  supabase: {},
  redis: {},
}));

import { resolveIntentNaturalLanguage } from "./orchestratorIntent.js";

function classifiedAs(intent: string): void {
  createMock.mockResolvedValue({ content: [{ type: "text", text: intent }] });
}

describe("resolveIntentNaturalLanguage", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("passes through what the classifier decides", async () => {
    classifiedAs("WEALTH");
    await expect(resolveIntentNaturalLanguage("am I saving enough?")).resolves.toBe("WEALTH");
  });

  it("falls back to GENERAL on an unrecognised label", async () => {
    classifiedAs("CULTURE");
    await expect(resolveIntentNaturalLanguage("what should I read?")).resolves.toBe("GENERAL");
  });

  it("forces an explicit meal log to HEALTH without calling the classifier", async () => {
    await expect(resolveIntentNaturalLanguage("meal: two eggs and toast")).resolves.toBe("HEALTH");
    await expect(resolveIntentNaturalLanguage("/meal rice and dal")).resolves.toBe("HEALTH");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("includes structural routing hints in the classifier payload", async () => {
    classifiedAs("GENERAL");
    await resolveIntentNaturalLanguage("search YouTube for lo-fi study beats");
    const payload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(payload.routing_hints.looks_like_youtube_action).toBe(true);

    createMock.mockReset();
    classifiedAs("HEALTH");
    await resolveIntentNaturalLanguage("Pull data from hevy");
    const hevyPayload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(hevyPayload.routing_hints.looks_like_health_fitness_read).toBe(true);

    createMock.mockReset();
    classifiedAs("WEALTH");
    await resolveIntentNaturalLanguage("show my kite portfolio");
    const wealthPayload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(wealthPayload.routing_hints.looks_like_wealth_portfolio_read).toBe(true);
  });

  it("leaves routing to the classifier when hints are ambiguous", async () => {
    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("where should we eat on Saturday?"),
    ).resolves.toBe("HAPPINESS");

    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("search YouTube for lo-fi study beats"),
    ).resolves.toBe("HAPPINESS");
  });

  it("asks for a single token, keeping the classify call cheap", async () => {
    classifiedAs("HEALTH");
    await resolveIntentNaturalLanguage("should I train today?");
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 16 }));
  });

  it("forces HEALTH on yes when meal log confirm is pending", async () => {
    await expect(
      resolveIntentNaturalLanguage("yes", {
        routingContext: {
          userProfileId: "u1",
          assembledAt: new Date().toISOString(),
          identity: {
            timezone: "UTC",
            northStarGoal: "",
            healthOnboardingComplete: true,
          },
          integrations: {
            notion: "not_connected",
            googleCalendar: "not_connected",
            youtube: "not_connected",
            hevy: "not_connected",
            zerodha: "not_connected",
          },
          recentTurns: [],
          pending: { mealLogConfirm: { preview: "burrito bowl" } },
          activeWork: { activeProjects: [], gymEventToday: false, openCommitmentCount: 0 },
          standing: { programNotes: [], routingFacts: [] },
          routingHints: {
            explicit_meal_log: false,
            looks_like_meal_log_read: false,
            looks_like_youtube_action: false,
            looks_like_magnus_tool_action: false,
            looks_like_magnus_tool_continuation: false,
            looks_like_health_fitness_read: false,
            looks_like_wealth_portfolio_read: false,
            holistic_day_ask: false,
            saved_media_pick: false,
            schedule_accuracy_challenge: false,
            compound_action: false,
          },
          gaps: [],
        },
      }),
    ).resolves.toBe("HEALTH");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("includes routing_context in classifier payload when provided", async () => {
    classifiedAs("GENERAL");
    await resolveIntentNaturalLanguage("what's on tomorrow?", {
      routingContext: {
        userProfileId: "u1",
        assembledAt: new Date().toISOString(),
        identity: {
          timezone: "Asia/Kolkata",
          northStarGoal: "Ship Magnus",
          healthOnboardingComplete: true,
        },
        integrations: {
          notion: "connected",
          googleCalendar: "connected",
          youtube: "not_connected",
          hevy: "connected",
          zerodha: "not_connected",
        },
        recentTurns: [],
        pending: {},
        activeWork: { activeProjects: [], gymEventToday: false, openCommitmentCount: 2 },
        standing: { programNotes: [], routingFacts: [] },
        routingHints: {
          explicit_meal_log: false,
          looks_like_meal_log_read: false,
          looks_like_youtube_action: false,
          looks_like_magnus_tool_action: false,
          looks_like_magnus_tool_continuation: false,
          looks_like_health_fitness_read: false,
          looks_like_wealth_portfolio_read: false,
          holistic_day_ask: true,
          saved_media_pick: false,
          schedule_accuracy_challenge: false,
          compound_action: false,
        },
        gaps: [],
      },
    });
    const payload = JSON.parse(String(createMock.mock.calls[0]![0].messages[0].content));
    expect(payload.routing_context.integrations.googleCalendar).toBe("connected");
    expect(payload.routing_context.active_work.open_commitment_count).toBe(2);
  });
});
