import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("../../../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
  redis: {},
}));

import { anthropic } from "../../../../tools/clients.js";
import { shouldAcceptFitnessTurn } from "./fitnessAgent.js";

describe("shouldAcceptFitnessTurn", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("accepts on keyword without calling the sub-classifier", async () => {
    const ok = await shouldAcceptFitnessTurn("Heading to the gym after work", anthropic);
    expect(ok).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("accepts when the sub-classifier returns FITNESS", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "FITNESS" }],
    });
    const ok = await shouldAcceptFitnessTurn(
      "How should I prepare for a long ride weekend in August? Only home space.",
      anthropic,
    );
    expect(ok).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({ max_tokens: 64 });
  });

  it("declines when the sub-classifier returns NUTRITION", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "NUTRITION" }],
    });
    const ok = await shouldAcceptFitnessTurn("Macros look off this week", anthropic);
    expect(ok).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
