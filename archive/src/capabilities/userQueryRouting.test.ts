/**
 * Data-driven routing expectations for 100+ user asks.
 * Catalog documents ideal intent/capability; routing signals are LLM-parsed (see routingContextParser).
 *
 * Catalog: src/capabilities/userQueryCatalog.ts
 * Human guide: docs/USER_QUERY_GUIDE.md
 */
import { describe, expect, it } from "vitest";

import { parseMealLogCommand } from "../meals/parseMealLogCommand.js";
import {
  groupUserQueriesByCategory,
  USER_QUERY_CATALOG,
} from "./userQueryCatalog.js";

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
    });
  }

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
