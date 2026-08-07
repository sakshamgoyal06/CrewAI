import { describe, expect, it } from "vitest";

import {
  looksLikeHealthFitnessIntent,
  looksLikeWealthPortfolioIntent,
  messageHasPillarSignal,
  recentTurnsHavePillarSignal,
  resolvePillarsToConsultOnGeneral,
} from "./pillarConsultationSignals.js";

describe("pillarConsultationSignals", () => {
  it("detects health hevy and gym session phrasing", () => {
    expect(messageHasPillarSignal("HEALTH", "Pull data from hevy")).toBe(true);
    expect(messageHasPillarSignal("HEALTH", "How was my todays gym session")).toBe(true);
    expect(looksLikeHealthFitnessIntent("Pull data from hevy")).toBe(true);
  });

  it("detects wealth portfolio phrasing", () => {
    expect(messageHasPillarSignal("WEALTH", "show my kite portfolio")).toBe(true);
    expect(looksLikeWealthPortfolioIntent("pull my zerodha holdings")).toBe(true);
  });

  it("detects happiness and wisdom signals", () => {
    expect(messageHasPillarSignal("HAPPINESS", "recommend a book like Dune")).toBe(true);
    expect(messageHasPillarSignal("WISDOM", "help me plan learning rust")).toBe(true);
  });

  it("resolves multiple pillars from context", () => {
    expect(
      resolvePillarsToConsultOnGeneral({
        userMessage: "quick question",
        recentTurns: [
          { role: "user", content: "how is my gym going?" },
          {
            role: "assistant",
            content: "portfolio drift",
            metadata: { delegated_agent: "Wealth" },
          },
        ],
      }),
    ).toEqual(expect.arrayContaining(["HEALTH", "WEALTH"]));
  });

  it("does not flag unrelated messages", () => {
    expect(messageHasPillarSignal("HEALTH", "what's on my calendar tomorrow?")).toBe(false);
    expect(resolvePillarsToConsultOnGeneral({ userMessage: "thanks", recentTurns: [] })).toEqual(
      [],
    );
  });
});
