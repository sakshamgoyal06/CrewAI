import type { CapabilityCatalog } from "../types.js";

export const WISDOM_CAPABILITY_CATALOG: CapabilityCatalog = {
  pillar: "WISDOM",
  capabilities: [
    {
      id: "learning_plan",
      summary: "Curricula, milestones, spaced practice, skill acquisition paths",
      disambiguation: "How to learn X — courses, study plans, review cadence.",
    },
    {
      id: "career_direction",
      summary: "Career positioning, promotions, growth conversations, evidence",
      disambiguation: "Job/career moves — not day scheduling (GENERAL).",
    },
    {
      id: "project_shipping",
      summary: "Scoping, unblocking, and shipping projects the user owns",
      disambiguation: 'Getting something "done" — smallest next step, risks, definition of done.',
    },
    {
      id: "skill_practice",
      summary: "Deliberate practice, craft feedback, instrument/technical drills",
      disambiguation: "Practice routines for a skill — leisure-only music stays HAPPINESS.",
    },
    {
      id: "coaching",
      summary: "General growth and wisdom when no narrower capability fits",
      disambiguation: "Fallback for mixed learning/career asks.",
    },
  ],
};

export const WISDOM_CAPABILITY_IDS = WISDOM_CAPABILITY_CATALOG.capabilities.map((c) => c.id);
