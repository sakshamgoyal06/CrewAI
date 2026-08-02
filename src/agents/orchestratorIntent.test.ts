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
