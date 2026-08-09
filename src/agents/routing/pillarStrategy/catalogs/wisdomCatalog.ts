import type { CapabilityCatalog } from "../types.js";

export const WISDOM_CAPABILITY_CATALOG: CapabilityCatalog = {
  pillar: "WISDOM",
  capabilities: [
    {
      id: "coaching",
      summary: "Learning plans, skill practice, career direction, shipping projects",
      disambiguation:
        "No tools. Day/calendar planning belongs to GENERAL. Default for growth/career asks.",
    },
  ],
};

export const WISDOM_CAPABILITY_IDS = WISDOM_CAPABILITY_CATALOG.capabilities.map((c) => c.id);
