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

import { TRIP_DESIGNER_SYSTEM, runTripDesignerAgent } from "./tripDesignerAgent.js";

describe("tripDesignerAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Day 1–2: base in Kyoto for temples; build in one rest half-day.",
        },
      ],
    });
  });

  it("TRIP_DESIGNER_SYSTEM disclaims booking APIs and live availability", () => {
    const s = TRIP_DESIGNER_SYSTEM.toLowerCase();
    expect(s).toMatch(/booking|reserve|availability|v1/);
    expect(s).toMatch(/not.*(have access|claim)/i);
  });

  it("TRIP_DESIGNER_SYSTEM covers itinerary, constraints, and packing", () => {
    const s = TRIP_DESIGNER_SYSTEM.toLowerCase();
    expect(s).toMatch(/itinerary|outline/);
    expect(s).toMatch(/constraint|budget|mobility/);
    expect(s).toMatch(/pack/);
  });

  it("runTripDesignerAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runTripDesignerAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "Outline a relaxed week in Japan in autumn.",
      intent: "HAPPINESS",
    });
    expect(out.text).toBe(
      "Day 1–2: base in Kyoto for temples; build in one rest half-day.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "TripDesigner",
      pillar: "joy",
      department: "adventure_trips",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 768,
        system: TRIP_DESIGNER_SYSTEM,
      }),
    );
  });
});
