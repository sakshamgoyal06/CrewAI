import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
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

import {
  LEARNING_PLAN_SYSTEM,
  runLearningPlanAgent,
} from "./learningPlanAgent.js";

describe("learningPlanAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Start with three milestones: foundations, application, integration. Space reviews at day 2, 7, and 14.",
        },
      ],
    });
  });

  it("LEARNING_PLAN_SYSTEM centres curriculum, milestones, topics, and spaced practice — not daily planning", () => {
    const s = LEARNING_PLAN_SYSTEM.toLowerCase();
    expect(s).toMatch(/milestone/);
    expect(s).toMatch(/spaced|revisit/);
    expect(s).toMatch(/topic|thread/);
    expect(s).toMatch(/planner|daily|to-do/);
  });

  it("LEARNING_PLAN_SYSTEM distinguishes Planner scope", () => {
    expect(LEARNING_PLAN_SYSTEM).toMatch(/Planner/);
  });

  it("runLearningPlanAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runLearningPlanAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "Help me structure learning Spanish over the next few months.",
      intent: "LEARNING",
    });
    expect(out.text).toBe(
      "Start with three milestones: foundations, application, integration. Space reviews at day 2, 7, and 14.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "LearningPlan",
      pillar: "wisdom",
      department: "learning_plan",
      departmentIntent: "LEARNING",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 768 }),
    );
  });
});
