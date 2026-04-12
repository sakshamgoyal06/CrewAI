import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALTERNATES_RECOMMENDER_SYSTEM,
  matchesAlternatesIntent,
  tryAlternatesRecommenderAgent,
} from "./alternatesRecommenderAgent.js";

const createMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

describe("matchesAlternatesIntent", () => {
  it("matches instead of, swap, and alternative to (case-insensitive)", () => {
    expect(matchesAlternatesIntent("What can I eat instead of dairy?")).toBe(true);
    expect(matchesAlternatesIntent("swap butter for coconut oil")).toBe(true);
    expect(matchesAlternatesIntent("I need an alternative to wheat flour")).toBe(true);
    expect(matchesAlternatesIntent("INSTEAD OF eggs what works for binding?")).toBe(true);
  });

  it("returns false when no alternates keywords", () => {
    expect(matchesAlternatesIntent("How much protein per day on a cut?")).toBe(false);
    expect(matchesAlternatesIntent("Log meal: oatmeal and berries")).toBe(false);
  });
});

describe("tryAlternatesRecommenderAgent", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "mock alternates reply" }],
    });
  });

  it("returns null without calling the model when keywords do not match", async () => {
    const out = await tryAlternatesRecommenderAgent({
      userProfileId: "u1",
      telegramUserId: "t1",
      rawMessage: "How much protein on a cut?",
      intent: "HEALTH",
    });
    expect(out).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("calls the model and returns metadata when keywords match", async () => {
    const out = await tryAlternatesRecommenderAgent({
      userProfileId: "u1",
      telegramUserId: "t1",
      rawMessage: "Vegan alternative to butter for baking — ideas?",
      intent: "HEALTH",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0]).toMatchObject({
      system: ALTERNATES_RECOMMENDER_SYSTEM,
    });
    expect(out).toMatchObject({
      text: "mock alternates reply",
      metadata: {
        specialist: "AlternatesRecommender",
        department: "nutrition",
      },
    });
  });
});
