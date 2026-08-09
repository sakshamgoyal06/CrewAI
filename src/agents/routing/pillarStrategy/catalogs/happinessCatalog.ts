import type { CapabilityCatalog } from "../types.js";

export const HAPPINESS_CAPABILITY_CATALOG: CapabilityCatalog = {
  pillar: "HAPPINESS",
  capabilities: [
    {
      id: "coaching",
      summary: "Books, film, games, hobbies, travel, relationships, rest — taste recommendations",
      disambiguation:
        "No tools. List/YouTube actions belong to GENERAL, not Happiness. Default for leisure asks.",
    },
  ],
};

export const HAPPINESS_CAPABILITY_IDS = HAPPINESS_CAPABILITY_CATALOG.capabilities.map((c) => c.id);
