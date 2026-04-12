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

import { BUILD_SHIP_SYSTEM, runBuildShipAgent } from "./buildShipAgent.js";

describe("buildShipAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Milestone 1: vertical slice; unblock: spike auth flow.",
        },
      ],
    });
  });

  it("BUILD_SHIP_SYSTEM covers scoping, milestones, and unblocking", () => {
    const s = BUILD_SHIP_SYSTEM.toLowerCase();
    expect(s).toMatch(/scop/);
    expect(s).toMatch(/milestone/);
    expect(s).toMatch(/unblock/);
  });

  it("BUILD_SHIP_SYSTEM distinguishes maker work from Planner locked-day planning", () => {
    const s = BUILD_SHIP_SYSTEM.toLowerCase();
    expect(s).toMatch(/planner/);
    expect(s).toMatch(/locked.day|locked day|morning/);
  });

  it("runBuildShipAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runBuildShipAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "How do I sequence MVP milestones for a CLI tool?",
      intent: "BUILD",
    });
    expect(out.text).toBe(
      "Milestone 1: vertical slice; unblock: spike auth flow.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "BuildShip",
      pillar: "wisdom",
      department: "build_ship",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 768,
        system: BUILD_SHIP_SYSTEM,
      }),
    );
  });
});
