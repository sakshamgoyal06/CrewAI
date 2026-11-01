import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
  anthropic: { messages: { create: vi.fn() } },
  redis: {},
}));

import {
  runHealthOnboardingTurn,
  startHealthOnboarding,
} from "./healthOnboarding.js";

describe("healthOnboarding", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("startHealthOnboarding inserts a row and returns intro", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation(() => ({ insert }));

    const out = await startHealthOnboarding({
      userMessage: "I want to focus on health",
      userProfileId: "u1",
      telegramUserId: "t1",
    });

    expect(out.text).toContain("Welcome to Health");
    expect(out.metadata.health_onboarding).toBe("started");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_profile_id: "u1", next_question: "fitness" }),
    );
  });

  it("runHealthOnboardingTurn saves fitness answer and advances to diet", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    fromMock.mockImplementation(() => ({ update }));

    const row = {
      id: "1",
      user_profile_id: "u1",
      onboarding_completed_at: null,
      next_question: "fitness" as const,
      fitness_goals: null,
      diet_preferences: null,
      meal_timing_notes: null,
      dietary_restrictions: null,
    };

    const out = await runHealthOnboardingTurn(
      { userMessage: "Run a 10k", userProfileId: "u1", telegramUserId: "t1" },
      row,
    );

    expect(out.text).toContain("Nutrition");
    expect(out.metadata.step).toBe("diet");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        fitness_goals: "Run a 10k",
        next_question: "diet",
      }),
    );
  });
});
