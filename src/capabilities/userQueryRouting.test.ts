/**
 * Data-driven routing expectations for common user asks.
 * Tests structural signals (hints + detectors), not LLM classification.
 *
 * See docs/USER_QUERY_GUIDE.md for the human-readable catalog.
 */
import { describe, expect, it } from "vitest";

import { buildIntentRoutingHints } from "../agents/routing/intentRoutingHints.js";
import { looksLikeMagnusToolAction } from "../agents/tools/magnusActionDetect.js";
import { looksLikeYoutubeAction } from "../agents/tools/youtubeActionDetect.js";
import { parseMealLogCommand } from "../meals/parseMealLogCommand.js";

type RoutingExpectation = {
  query: string;
  /** Documented ideal intent when hints are unambiguous or classifier guidance applies */
  idealIntent: "HEALTH" | "WEALTH" | "HAPPINESS" | "WISDOM" | "GENERAL";
  /** Capability id from pillar catalogs — ideal parser step */
  idealCapability: string;
  hints: Partial<{
    explicit_meal_log: boolean;
    looks_like_youtube_action: boolean;
    looks_like_magnus_tool_action: boolean;
    looks_like_health_fitness_read: boolean;
    looks_like_wealth_portfolio_read: boolean;
  }>;
  magnusTools?: boolean;
  notes?: string;
};

const USER_QUERIES: RoutingExpectation[] = [
  // —— HEALTH: meal logging (deterministic) ——
  {
    query: "meal: chicken rice and dal",
    idealIntent: "HEALTH",
    idealCapability: "meal_log",
    hints: { explicit_meal_log: true },
  },
  {
    query: "/meal oats and banana",
    idealIntent: "HEALTH",
    idealCapability: "meal_log",
    hints: { explicit_meal_log: true },
  },
  {
    query: "log meal: paneer tikka",
    idealIntent: "HEALTH",
    idealCapability: "meal_log",
    hints: { explicit_meal_log: true },
  },
  // —— HEALTH: coaching (classifier-owned) ——
  {
    query: "should I train legs today?",
    idealIntent: "HEALTH",
    idealCapability: "fitness",
    hints: {},
  },
  {
    query: "how much protein should I aim for?",
    idealIntent: "HEALTH",
    idealCapability: "nutrition_advice",
    hints: {},
  },
  {
    query: "I'm exhausted and slept badly",
    idealIntent: "HEALTH",
    idealCapability: "energy",
    hints: {},
  },
  {
    query: "plan my meals for the week",
    idealIntent: "HEALTH",
    idealCapability: "meal_plan_create",
    hints: {},
  },
  {
    query: "what am I eating tomorrow?",
    idealIntent: "HEALTH",
    idealCapability: "meal_plan_read",
    hints: {},
  },
  {
    query: "Pull data from hevy and review my last workout",
    idealIntent: "HEALTH",
    idealCapability: "fitness",
    hints: { looks_like_health_fitness_read: true },
  },
  // —— WEALTH ——
  {
    query: "show my kite portfolio",
    idealIntent: "WEALTH",
    idealCapability: "coaching",
    hints: { looks_like_wealth_portfolio_read: true },
  },
  {
    query: "connect zerodha",
    idealIntent: "WEALTH",
    idealCapability: "kite_connect",
    hints: {},
  },
  {
    query: "am I saving enough for retirement?",
    idealIntent: "WEALTH",
    idealCapability: "coaching",
    hints: {},
  },
  // —— HAPPINESS ——
  {
    query: "recommend a film like Arrival",
    idealIntent: "HAPPINESS",
    idealCapability: "recommendations",
    hints: {},
    magnusTools: false,
  },
  {
    query: "ideas for a restorative weekend",
    idealIntent: "HAPPINESS",
    idealCapability: "travel_rest",
    hints: {},
  },
  {
    query: "how do I reconnect with an old friend?",
    idealIntent: "HAPPINESS",
    idealCapability: "relationships",
    hints: {},
  },
  // —— WISDOM ——
  {
    query: "help me build a learning plan for Spanish",
    idealIntent: "WISDOM",
    idealCapability: "learning_plan",
    hints: {},
  },
  {
    query: "how do I ship my side project faster?",
    idealIntent: "WISDOM",
    idealCapability: "project_shipping",
    hints: {},
  },
  {
    query: "prep for a promotion conversation",
    idealIntent: "WISDOM",
    idealCapability: "career_direction",
    hints: {},
  },
  // —— GENERAL: Magnus tools ——
  {
    query: "what's on my calendar tomorrow?",
    idealIntent: "GENERAL",
    idealCapability: "calendar",
    hints: {},
  },
  {
    query: "what does my entire day look like tomorrow?",
    idealIntent: "GENERAL",
    idealCapability: "day_overview",
    hints: {},
    notes: "Holistic day — not HEALTH meal_plan_read",
  },
  {
    query: "search YouTube for lo-fi study beats",
    idealIntent: "GENERAL",
    idealCapability: "youtube",
    hints: { looks_like_youtube_action: true },
  },
  {
    query: "add Dune to my readlist",
    idealIntent: "GENERAL",
    idealCapability: "lists",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "what's on my watchlist?",
    idealIntent: "GENERAL",
    idealCapability: "lists",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "recommend a short thriller from my watchlist",
    idealIntent: "GENERAL",
    idealCapability: "lists",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "log joy tank 72",
    idealIntent: "GENERAL",
    idealCapability: "lifeos",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "log this in my daily checkins",
    idealIntent: "GENERAL",
    idealCapability: "lifeos",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "connect notion",
    idealIntent: "GENERAL",
    idealCapability: "notion",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "reschedule my gym commitment to Friday",
    idealIntent: "GENERAL",
    idealCapability: "event_log",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "remind me tomorrow at 8pm to call mom",
    idealIntent: "GENERAL",
    idealCapability: "proactive",
    hints: { looks_like_magnus_tool_action: true },
    magnusTools: true,
  },
  {
    query: "connect google",
    idealIntent: "GENERAL",
    idealCapability: "calendar",
    hints: {},
    notes: "OAuth — often via connect_google tool after parser",
  },
  {
    query: "quick note: great meeting with design team",
    idealIntent: "GENERAL",
    idealCapability: "journal_note",
    hints: {},
  },
  // —— GENERAL: pillar consultation ——
  {
    query: "review my hevy workout and log this in my daily checkins",
    idealIntent: "GENERAL",
    idealCapability: "pillar_consultation",
    hints: { looks_like_magnus_tool_action: true, looks_like_health_fitness_read: true },
    magnusTools: true,
    notes: "Magnus tools + HEALTH depth in one turn",
  },
  // —— GENERAL: conversation ——
  {
    query: "what's the capital of Portugal?",
    idealIntent: "GENERAL",
    idealCapability: "conversation",
    hints: {},
    magnusTools: false,
  },
];

describe("user query routing catalog", () => {
  it("documents at least 30 representative user asks", () => {
    expect(USER_QUERIES.length).toBeGreaterThanOrEqual(30);
  });

  for (const entry of USER_QUERIES) {
    describe(entry.query.slice(0, 60), () => {
      it("builds routing hints matching expectations", () => {
        const hints = buildIntentRoutingHints(entry.query);
        for (const [key, expected] of Object.entries(entry.hints)) {
          expect(hints[key as keyof typeof hints], key).toBe(expected);
        }
      });

      it("matches magnus tool detector when specified", () => {
        if (entry.magnusTools !== undefined) {
          expect(looksLikeMagnusToolAction(entry.query)).toBe(entry.magnusTools);
        }
      });

      it("explicit meal logs parse as meal commands", () => {
        if (entry.hints.explicit_meal_log) {
          expect(parseMealLogCommand(entry.query).kind).toBe("meal");
        }
      });

      it("has a documented ideal intent and capability", () => {
        expect(entry.idealIntent).toMatch(/^(HEALTH|WEALTH|HAPPINESS|WISDOM|GENERAL)$/);
        expect(entry.idealCapability.length).toBeGreaterThan(0);
      });
    });
  }

  it("does not treat youtube actions as magnus list actions", () => {
    const q = "search YouTube for jazz";
    expect(looksLikeYoutubeAction(q)).toBe(true);
    expect(looksLikeMagnusToolAction(q)).toBe(false);
  });
});

/** Exported for docs generation and audit reports */
export const USER_QUERY_CATALOG = USER_QUERIES;
