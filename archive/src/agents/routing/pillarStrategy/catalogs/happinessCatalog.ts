import type { CapabilityCatalog } from "../types.js";

export const HAPPINESS_CAPABILITY_CATALOG: CapabilityCatalog = {
  pillar: "HAPPINESS",
  capabilities: [
    {
      id: "recommendations",
      summary: "Books, film, music, games, hobbies — taste-based picks",
      disambiguation:
        "What to read/watch/play/listen to. List/YouTube actions belong to GENERAL, not Happiness.",
    },
    {
      id: "travel_rest",
      summary: "Trip ideas, pacing, restorative leisure, rest without burnout",
      disambiguation: "Travel planning, downtime, vacation pacing — no bookings.",
    },
    {
      id: "relationships",
      summary: "Friends, family, social energy, hard conversations, keeping in touch",
      disambiguation: "People and relationships — not calendar scheduling (GENERAL).",
    },
    {
      id: "creative_practice",
      summary: "Creative hobbies, side projects for joy, artistic practice",
      disambiguation: "Making for pleasure — career/skill growth belongs to WISDOM.",
    },
    {
      id: "coaching",
      summary: "General leisure and joy when no narrower capability fits",
      disambiguation: "Fallback for mixed leisure asks.",
    },
  ],
};

export const HAPPINESS_CAPABILITY_IDS = HAPPINESS_CAPABILITY_CATALOG.capabilities.map((c) => c.id);
