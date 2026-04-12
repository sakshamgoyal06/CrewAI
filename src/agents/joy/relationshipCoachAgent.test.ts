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
  RELATIONSHIP_COACH_SYSTEM,
  runRelationshipCoachAgent,
} from "./relationshipCoachAgent.js";

describe("relationshipCoachAgent", () => {
  beforeEach(() => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Try a short opener that names your need, then one boundary in plain language.",
        },
      ],
    });
  });

  it("RELATIONSHIP_COACH_SYSTEM disclaims therapy and points to professionals for crisis or clinical needs", () => {
    const s = RELATIONSHIP_COACH_SYSTEM.toLowerCase();
    expect(s).toMatch(/therapy|counselling|counseling|clinical/);
    expect(s).toMatch(/crisis|emergency|licensed|qualified professional/);
  });

  it("runRelationshipCoachAgent returns expected metadata and calls Anthropic", async () => {
    const out = await runRelationshipCoachAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "How do I say no to a draining friend without ghosting?",
      intent: "RELATIONSHIPS",
    });
    expect(out.text).toBe(
      "Try a short opener that names your need, then one boundary in plain language.",
    );
    expect(out.metadata).toMatchObject({
      specialist: "RelationshipCoach",
      pillar: "joy",
      department: "relationships",
    });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 768,
        system: RELATIONSHIP_COACH_SYSTEM,
      }),
    );
  });
});
