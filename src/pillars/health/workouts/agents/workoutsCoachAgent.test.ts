import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./fitnessAgent.js", () => ({
  tryFitnessAgent: vi.fn(),
}));

import { tryFitnessAgent } from "./fitnessAgent.js";
import { runWorkoutsCoachAgent } from "./workoutsCoachAgent.js";

const baseCtx = {
  userProfileId: "profile-1",
  telegramUserId: "tg-1",
  rawMessage: "Leg day ideas?",
  intent: "HEALTH" as const,
};

describe("runWorkoutsCoachAgent", () => {
  beforeEach(() => {
    vi.mocked(tryFitnessAgent).mockReset();
  });

  it("delegates to tryFitnessAgent and returns the same structure when mocked", async () => {
    const agentResult = {
      text: "Try goblet squats and walking lunges.",
      metadata: {
        specialist: "Fitness",
        agent: "fitness",
        department: "HEALTH",
        workout_data: "empty",
      },
    };
    vi.mocked(tryFitnessAgent).mockResolvedValue(agentResult);

    const out = await runWorkoutsCoachAgent(baseCtx);

    expect(tryFitnessAgent).toHaveBeenCalledTimes(1);
    expect(tryFitnessAgent).toHaveBeenCalledWith(baseCtx);
    expect(out).toEqual(agentResult);
  });

  it("returns null when tryFitnessAgent returns null", async () => {
    vi.mocked(tryFitnessAgent).mockResolvedValue(null);

    const out = await runWorkoutsCoachAgent(baseCtx);

    expect(out).toBeNull();
  });
});
