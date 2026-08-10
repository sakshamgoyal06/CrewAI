/**
 * Data-driven routing expectations for 100+ user asks.
 * Tests structural signals (hints + detectors), not LLM classification.
 *
 * Catalog: src/capabilities/userQueryCatalog.ts
 * Human guide: docs/USER_QUERY_GUIDE.md
 */
import { describe, expect, it } from "vitest";

import { buildIntentRoutingHints } from "../agents/routing/intentRoutingHints.js";
import { resolvePillarsToConsultOnGeneral } from "../agents/routing/pillarConsultationSignals.js";
import { looksLikeMagnusToolAction } from "../agents/tools/magnusActionDetect.js";
import { looksLikeYoutubeAction } from "../agents/tools/youtubeActionDetect.js";
import { parseMealLogCommand } from "../meals/parseMealLogCommand.js";
import {
  groupUserQueriesByCategory,
  USER_QUERY_CATALOG,
  type UserQueryExpectation,
} from "./userQueryCatalog.js";

function assertNoToolCollision(entry: UserQueryExpectation): void {
  const youtube = looksLikeYoutubeAction(entry.query);
  const magnus = looksLikeMagnusToolAction(entry.query);
  if (youtube && magnus) {
    throw new Error(`Query triggers both youtube and magnus detectors: ${entry.query}`);
  }
}

describe("user query routing catalog", () => {
  it("documents at least 100 user asks", () => {
    expect(USER_QUERY_CATALOG.length).toBeGreaterThanOrEqual(100);
  });

  it("covers every major routing category", () => {
    const groups = groupUserQueriesByCategory();
    const required = [
      "health_meal_log",
      "health_fitness",
      "wealth",
      "happiness",
      "wisdom",
      "general_calendar",
      "general_youtube",
      "general_lists",
      "general_lifeos",
      "general_event_log",
      "general_conversation",
    ];
    for (const cat of required) {
      expect(groups[cat]?.length ?? 0, `missing category ${cat}`).toBeGreaterThan(0);
    }
  });

  it("has unique queries (no duplicate test cases)", () => {
    const seen = new Set<string>();
    for (const entry of USER_QUERY_CATALOG) {
      const key = entry.query.trim().toLowerCase();
      expect(seen.has(key), `duplicate query: ${entry.query}`).toBe(false);
      seen.add(key);
    }
  });

  for (const entry of USER_QUERY_CATALOG) {
    const label = `${entry.category}: ${entry.query.slice(0, 50)}`;

    describe(label, () => {
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

      it("matches youtube action detector when specified", () => {
        if (entry.youtubeAction !== undefined) {
          expect(looksLikeYoutubeAction(entry.query)).toBe(entry.youtubeAction);
        }
      });

      it("parses explicit meal logs as meal commands", () => {
        if (entry.hints.explicit_meal_log) {
          expect(parseMealLogCommand(entry.query).kind).toBe("meal");
        }
      });

      it("does not parse non-meal-log queries as meal commands", () => {
        if (entry.category.startsWith("health_") && entry.category !== "health_meal_log") {
          expect(parseMealLogCommand(entry.query).kind).toBe("none");
        }
      });

      it("has valid ideal intent and capability metadata", () => {
        expect(entry.idealIntent).toMatch(/^(HEALTH|WEALTH|HAPPINESS|WISDOM|GENERAL)$/);
        expect(entry.idealCapability.length).toBeGreaterThan(0);
        expect(entry.category.length).toBeGreaterThan(0);
      });

      it("does not collide youtube and magnus tool detectors", () => {
        assertNoToolCollision(entry);
      });

      it("resolves pillar consultation pillars when specified", () => {
        if (!entry.consultPillars) {
          return;
        }
        const resolved = resolvePillarsToConsultOnGeneral({
          userMessage: entry.query,
          recentTurns: [],
        });
        for (const pillar of entry.consultPillars) {
          expect(resolved).toContain(pillar);
        }
      });
    });
  }

  describe("cross-detector rules", () => {
    it("does not treat youtube actions as magnus list actions", () => {
      const q = "search YouTube for jazz";
      expect(looksLikeYoutubeAction(q)).toBe(true);
      expect(looksLikeMagnusToolAction(q)).toBe(false);
    });

    it("meal log hard path never needs magnus tools", () => {
      const q = "meal: eggs and toast";
      expect(parseMealLogCommand(q).kind).toBe("meal");
      expect(looksLikeMagnusToolAction(q)).toBe(false);
      expect(looksLikeYoutubeAction(q)).toBe(false);
    });

    it("taste recommendations without list slug stay off magnus tools", () => {
      const q = "recommend a film like Arrival";
      expect(looksLikeMagnusToolAction(q)).toBe(false);
      expect(looksLikeYoutubeAction(q)).toBe(false);
    });

    it("list recommend from saved slug triggers magnus not youtube", () => {
      const q = "recommend a short thriller from my watchlist";
      expect(looksLikeMagnusToolAction(q)).toBe(true);
      expect(looksLikeYoutubeAction(q)).toBe(false);
    });
  });

  describe("category distribution", () => {
    it("documents query count per category", () => {
      const groups = groupUserQueriesByCategory();
      const summary = Object.fromEntries(
        Object.entries(groups).map(([k, v]) => [k, v.length]),
      );
      expect(Object.keys(summary).length).toBeGreaterThanOrEqual(15);
      expect(summary.health_meal_log).toBeGreaterThanOrEqual(8);
      expect(summary.general_lists).toBeGreaterThanOrEqual(10);
    });
  });
});

export { USER_QUERY_CATALOG };
