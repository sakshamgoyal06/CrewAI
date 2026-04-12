import { beforeEach, describe, expect, it, vi } from "vitest";

import { ENERGY_SYSTEM } from "./energyAgent.js";
import { routeHealthMessage } from "./healthRouter.js";
import { NUTRITION_SYSTEM } from "./nutritionAgent.js";
import { FITNESS_SYSTEM } from "./fitnessAgent.js";

const createMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
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
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
  redis: {},
}));

function ctx(raw: string) {
  return {
    userProfileId: "u1",
    telegramUserId: "t1",
    rawMessage: raw,
    intent: "HEALTH" as const,
  };
}

describe("routeHealthMessage", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "mock reply" }],
    });
  });

  it("prefers Fitness when both fitness and nutrition keywords appear", async () => {
    await routeHealthMessage(
      ctx("Gym leg day then high protein meal — how to balance?"),
    );
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      system: FITNESS_SYSTEM,
    });
  });

  it("routes to Nutrition when not fitness-owned but nutrition keywords match", async () => {
    await routeHealthMessage(
      ctx("How much protein per day on a cut? I'm allergic to dairy."),
    );
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[1][0]).toMatchObject({
      system: NUTRITION_SYSTEM,
    });
  });

  it("routes to Energy last when sleep/HRV/focus language matches after Fitness and Nutrition decline", async () => {
    await routeHealthMessage(ctx("HRV is low and I'm wiped — recovery tips?"));
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[1][0]).toMatchObject({
      system: ENERGY_SYSTEM,
    });
  });

  it("calls the sub-classifier then returns generic acknowledgement when no specialist matches", async () => {
    const out = await routeHealthMessage(ctx("health check"));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(out.metadata?.genericAck).toBe(true);
  });
});
