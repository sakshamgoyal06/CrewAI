/**
 * 1000 natural-language chat message tests — catalog alignment + explicit meal protocol.
 *
 * Routing signals are LLM-parsed (routingContextParser); this suite no longer uses regex detectors.
 *
 * Suite: src/capabilities/chatMessageTestSuite.generated.ts
 * Regenerate: npx tsx scripts/dev/generate-chat-message-test-suite.mts
 * Analysis: npx tsx scripts/dev/analyze-chat-test-suite.mts
 */
import { describe, expect, it } from "vitest";

import { parseMealLogCommand } from "../meals/parseMealLogCommand.js";
import {
  analyzeStructuralCase,
  PRODUCTION_ISSUE_FINDINGS,
  summarizeSuiteAnalysis,
} from "./chatMessageTestAnalysis.js";
import {
  CHAT_MESSAGE_TEST_SUITE,
  CHAT_MESSAGE_TEST_SUITE_META,
} from "./chatMessageTestSuite.generated.js";

const deps = {
  mealParse: parseMealLogCommand,
};

describe("chat message test suite (1000 NL messages)", () => {
  it("has exactly 1000 unique messages", () => {
    expect(CHAT_MESSAGE_TEST_SUITE_META.totalCases).toBe(1000);
    expect(CHAT_MESSAGE_TEST_SUITE).toHaveLength(1000);
    const seen = new Set<string>();
    for (const tc of CHAT_MESSAGE_TEST_SUITE) {
      const key = tc.message.trim().toLowerCase();
      expect(seen.has(key), `duplicate: ${tc.message.slice(0, 60)}`).toBe(false);
      seen.add(key);
    }
  });

  it("includes real production chats", () => {
    expect(CHAT_MESSAGE_TEST_SUITE_META.realChatCount).toBeGreaterThanOrEqual(250);
    const real = CHAT_MESSAGE_TEST_SUITE.filter((c) => c.source === "real_chat");
    expect(real.length).toBeGreaterThanOrEqual(250);
  });

  it("covers major routing categories", () => {
    const cats = new Set(CHAT_MESSAGE_TEST_SUITE.map((c) => c.category));
    const required = [
      "health_meal",
      "health_fitness",
      "wealth",
      "general_youtube",
      "general_tools",
      "follow_up",
    ];
    for (const r of required) {
      expect(cats.has(r) || [...cats].some((c) => c.includes(r.split("_")[0]!)), r).toBe(true);
    }
  });

  it("documents production issue tags from real chats", () => {
    const tagged = CHAT_MESSAGE_TEST_SUITE.filter((c) => c.issueTags?.length);
    expect(tagged.length).toBeGreaterThan(20);
  });

  it("maps production findings to test coverage", () => {
    for (const finding of PRODUCTION_ISSUE_FINDINGS) {
      const covered = CHAT_MESSAGE_TEST_SUITE.some((tc) => {
        const msgMatch = finding.examples.some((ex) =>
          tc.message.toLowerCase().includes(ex.toLowerCase().slice(0, 25)),
        );
        const tagMatch = finding.id === "PI-005" && tc.issueTags?.includes("playlist_name_confusion");
        const titleWord = finding.title.split(" ")[0]?.toLowerCase();
        const tagFromTitle = tc.issueTags?.some((t) =>
          finding.title.toLowerCase().includes(t.replace(/_/g, " ")),
        );
        return (
          msgMatch ||
          tagMatch ||
          tagFromTitle ||
          (titleWord && tc.message.toLowerCase().includes(titleWord))
        );
      });
      expect(covered, `no test coverage for ${finding.id}`).toBe(true);
    }
  });

  describe("structural routing (sampled)", () => {
    const catalogCases = CHAT_MESSAGE_TEST_SUITE.filter((c) => c.idealIntent);
    const realCases = CHAT_MESSAGE_TEST_SUITE.filter((c) => c.source === "real_chat").slice(
      0,
      100,
    );
    const adversarial = CHAT_MESSAGE_TEST_SUITE.filter((c) => c.source === "adversarial");

    for (const tc of [...catalogCases, ...realCases, ...adversarial]) {
      it(`[${tc.id}] ${tc.message.slice(0, 55)}`, () => {
        const result = analyzeStructuralCase(tc, deps);
        expect(result.failures, result.failures.join("; ")).toEqual([]);
      });
    }
  });

  describe("suite-wide structural summary", () => {
    it("passes bulk structural checks", () => {
      const results = CHAT_MESSAGE_TEST_SUITE.map((tc) => analyzeStructuralCase(tc, deps));
      const summary = summarizeSuiteAnalysis(CHAT_MESSAGE_TEST_SUITE, results);
      expect(summary.total).toBe(1000);
      expect(summary.structuralFail).toBe(0);
    });
  });

  describe("explicit meal protocol", () => {
    it("meal: prefix always parses as meal", () => {
      const meals = CHAT_MESSAGE_TEST_SUITE.filter((tc) => tc.message.trim().toLowerCase().startsWith("meal:"));
      for (const tc of meals) {
        expect(parseMealLogCommand(tc.message).kind).toBe("meal");
      }
    });
  });
});
