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

  CULTURE_RECOMMENDER_SYSTEM,

  runCultureRecommenderAgent,

} from "./cultureRecommenderAgent.js";



describe("cultureRecommenderAgent", () => {

  beforeEach(() => {

    messagesCreate.mockResolvedValue({

      content: [

        {

          type: "text",

          text:

            "• *The Remains of the Day* — Ishiguro; quiet, dignified grief.\n" +

            "• *Paterson* (2016); gentle rhythm, poetry in ordinary life.",

        },

      ],

    });

  });



  it("CULTURE_RECOMMENDER_SYSTEM covers books, film, and poetry with concise list guidance", () => {

    const s = CULTURE_RECOMMENDER_SYSTEM.toLowerCase();

    expect(s).toMatch(/books?/);

    expect(s).toMatch(/film|series/);

    expect(s).toMatch(/poetr/);

    expect(s).toMatch(/list|bullet|numbered/);

    expect(s).toMatch(/saksham/);

  });



  it("runCultureRecommenderAgent returns expected metadata and calls Anthropic", async () => {

    const out = await runCultureRecommenderAgent({

      userProfileId: "00000000-0000-0000-0000-000000000001",

      telegramUserId: "1",

      rawMessage:

        "Feeling restless but low energy — want something literary, not loud.",

      intent: "CULTURE",

    });

    expect(out.text).toContain("Remains of the Day");

    expect(out.metadata).toMatchObject({

      specialist: "CultureRecommender",

      pillar: "joy",

      department: "culture",

    });

    expect(messagesCreate).toHaveBeenCalledWith(

      expect.objectContaining({

        max_tokens: 896,

        system: CULTURE_RECOMMENDER_SYSTEM,

      }),

    );

  });

});

