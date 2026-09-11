import { beforeEach, describe, expect, it, vi } from "vitest";

const parsePillarExecutionPlanMock = vi.fn();
const executePillarPlanMock = vi.fn();
const buildRoutingHintsMock = vi.fn();

vi.mock("./buildRoutingHints.js", () => ({
  buildRoutingHints: (...args: unknown[]) => buildRoutingHintsMock(...args),
}));

vi.mock("./parsePillarStrategy.js", () => ({
  parsePillarExecutionPlan: (...args: unknown[]) => parsePillarExecutionPlanMock(...args),
}));

vi.mock("./executePillarPlan.js", () => ({
  executePillarPlan: (...args: unknown[]) => executePillarPlanMock(...args),
}));

import { executeGeneralStrategy } from "./executeGeneralStrategy.js";
import type { AgentContext } from "../../types.js";

describe("executeGeneralStrategy", () => {
  beforeEach(() => {
    parsePillarExecutionPlanMock.mockReset();
    executePillarPlanMock.mockReset();
    buildRoutingHintsMock.mockReset();
    buildRoutingHintsMock.mockResolvedValue({});
    executePillarPlanMock.mockResolvedValue({ text: "ok", metadata: {} });
  });

  it("uses deterministic journal_note plan when routing context signals a journal save", async () => {
    const ctx: AgentContext = {
      userProfileId: "u1",
      telegramUserId: "t1",
      rawMessage: "Note a journal entry that yesterday was a great day — swimming breakthrough.",
      intent: "GENERAL",
      routingContext: {
        explicit_meal_log: false,
        looks_like_meal_log_read: false,
        looks_like_youtube_action: false,
        looks_like_magnus_tool_action: true,
        looks_like_magnus_tool_continuation: false,
        looks_like_health_fitness_read: false,
        looks_like_wealth_portfolio_read: false,
        holistic_day_ask: false,
        saved_media_pick: false,
        schedule_accuracy_challenge: false,
        compound_action: false,
        prefer_intent_health: false,
        looks_like_evening_journal: false,
        looks_like_journal_note: true,
        parked_feature_topic: null,
        consult_pillars: [],
        magnus_capabilities: ["journal"],
      },
    };

    await executeGeneralStrategy(ctx);

    expect(parsePillarExecutionPlanMock).not.toHaveBeenCalled();
    expect(executePillarPlanMock).toHaveBeenCalledWith(
      "GENERAL",
      expect.objectContaining({
        pillarStrategy: expect.objectContaining({
          steps: [{ capability: "journal_note", args: {} }],
          parser: "deterministic",
        }),
      }),
      expect.objectContaining({
        steps: [{ capability: "journal_note", args: {} }],
      }),
      expect.any(Object),
    );
  });
});
