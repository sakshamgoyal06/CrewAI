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
            limit: () => Promise.resolve({ data: [], error: { message: "skip" } }),
          }),
        }),
      }),
    }),
  },
  redis: {},
}));

import {
  isLearningTrackerMessage,
  LEARNING_TRACKER_SYSTEM,
  runLearningTrackerAgent,
} from "./learningTrackerAgent.js";

describe("Learning Tracker agent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "**This week** — steady.\n**Next step** — one block tomorrow." }],
    });
  });

  it("isLearningTrackerMessage distinguishes review-style vs curriculum-style", () => {
    expect(isLearningTrackerMessage("Weekly learning review — what should I tweak?")).toBe(true);
    expect(isLearningTrackerMessage("Help me build a curriculum for statistics")).toBe(false);
  });

  it("LEARNING_TRACKER_SYSTEM mentions weekly reviews and habits", () => {
    const s = LEARNING_TRACKER_SYSTEM.toLowerCase();
    expect(s).toContain("weekly");
    expect(s).toContain("habit");
  });

  it("runLearningTrackerAgent requests bounded max_tokens and returns metadata", async () => {
    const out = await runLearningTrackerAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "Weekly review: my reading habit slipped.",
      intent: "LEARNING",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 896 }),
    );
    expect(out.metadata).toMatchObject({
      specialist: "LearningTracker",
      department: "tracker",
      pillar: "wisdom",
    });
    expect(out.text.length).toBeGreaterThan(0);
  });

  it("runLearningTrackerAgent uses injected learningDbBlock when provided", async () => {
    const learningDbBlock = vi.fn().mockResolvedValue("\n\nOptional DB context");
    await runLearningTrackerAgent(
      {
        userProfileId: "u1",
        telegramUserId: "1",
        rawMessage: "Habit check-in",
        intent: "LEARNING",
      },
      { learningDbBlock },
    );
    expect(learningDbBlock).toHaveBeenCalledWith("u1");
    const lastCall = messagesCreate.mock.calls.at(-1)?.[0] as {
      messages: { content: string }[];
    };
    expect(lastCall?.messages[0]?.content).toContain("Optional DB context");
  });
});
