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

  it("forces an explicit meal log to HEALTH whatever the classifier says", async () => {
    classifiedAs("HAPPINESS");
    await expect(resolveIntentNaturalLanguage("meal: two eggs and toast")).resolves.toBe(
      "HEALTH",
    );

    classifiedAs("GENERAL");
    await expect(resolveIntentNaturalLanguage("/meal rice and dal")).resolves.toBe("HEALTH");
  });

  it("forces YouTube actions to GENERAL so Magnus tools run", async () => {
    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("search YouTube for lo-fi study beats"),
    ).resolves.toBe("GENERAL");

    classifiedAs("HAPPINESS");
    await expect(resolveIntentNaturalLanguage("bookmark that song")).resolves.toBe("GENERAL");
  });

  it("forces list and LifeOS tool actions to GENERAL", async () => {
    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("recommend a thriller from my watchlist"),
    ).resolves.toBe("GENERAL");

    classifiedAs("WEALTH");
    await expect(resolveIntentNaturalLanguage("add goal: emergency fund")).resolves.toBe(
      "GENERAL",
    );

    classifiedAs("HAPPINESS");
    await expect(resolveIntentNaturalLanguage("log joy tank 68")).resolves.toBe("GENERAL");

    classifiedAs("HEALTH");
    await expect(resolveIntentNaturalLanguage("connect notion")).resolves.toBe("GENERAL");
  });

  it("forces fitness and Hevy read turns to HEALTH", async () => {
    classifiedAs("GENERAL");
    await expect(resolveIntentNaturalLanguage("Pull data from hevy")).resolves.toBe("HEALTH");

    classifiedAs("GENERAL");
    await expect(resolveIntentNaturalLanguage("How was my todays gym session")).resolves.toBe(
      "HEALTH",
    );
  });

  it("forces portfolio reads to WEALTH", async () => {
    classifiedAs("GENERAL");
    await expect(resolveIntentNaturalLanguage("show my kite portfolio")).resolves.toBe("WEALTH");

    classifiedAs("GENERAL");
    await expect(resolveIntentNaturalLanguage("pull my zerodha holdings")).resolves.toBe("WEALTH");
  });

  it("forces daily check-in logs to GENERAL even when classified HEALTH", async () => {
    classifiedAs("HEALTH");
    await expect(
      resolveIntentNaturalLanguage("log that i did the workout in my daily check ins"),
    ).resolves.toBe("GENERAL");

    classifiedAs("HEALTH");
    await expect(
      resolveIntentNaturalLanguage("I am done with the workout. Read hevy, review, and log"),
    ).resolves.toBe("GENERAL");
  });

  it("forces tool continuations to GENERAL after a YouTube turn", async () => {
    classifiedAs("WISDOM");
    await expect(
      resolveIntentNaturalLanguage("Yes, add RAG and vector databases", {
        recentTurns: [
          {
            role: "assistant",
            content: "Want me to add RAG videos?",
            metadata: { tools_used: ["youtube_search"] },
          },
        ],
      }),
    ).resolves.toBe("GENERAL");
  });

  it("forces list follow-ups to GENERAL after a list tool turn", async () => {
    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("Yes, add it", {
        recentTurns: [
          {
            role: "assistant",
            content: "Want me to add Dune to your readlist?",
            metadata: { tools_used: ["list_items"] },
          },
        ],
      }),
    ).resolves.toBe("GENERAL");
  });

  it("leaves ordinary talk about food to the classifier", async () => {
    classifiedAs("HAPPINESS");
    await expect(
      resolveIntentNaturalLanguage("where should we eat on Saturday?"),
    ).resolves.toBe("HAPPINESS");
  });

  it("asks for a single token, keeping the classify call cheap", async () => {
    classifiedAs("HEALTH");
    await resolveIntentNaturalLanguage("should I train today?");
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 16 }));
  });
});
