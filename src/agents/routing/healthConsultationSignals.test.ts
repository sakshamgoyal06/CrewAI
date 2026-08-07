import { describe, expect, it } from "vitest";

import {
  looksLikeHealthFitnessIntent,
  messageHasHealthSignal,
  recentTurnsHaveHealthSignal,
  shouldConsultHealthOnGeneral,
} from "./healthConsultationSignals.js";

describe("healthConsultationSignals", () => {
  it("detects hevy and gym session phrasing", () => {
    expect(messageHasHealthSignal("Pull data from hevy")).toBe(true);
    expect(messageHasHealthSignal("How was my todays gym session")).toBe(true);
    expect(looksLikeHealthFitnessIntent("Pull data from hevy")).toBe(true);
    expect(looksLikeHealthFitnessIntent("How was my todays gym session")).toBe(true);
  });

  it("detects health context in recent turns", () => {
    expect(
      recentTurnsHaveHealthSignal([
        { role: "user", content: "how's the weather?" },
        {
          role: "assistant",
          content: "Push A done.",
          metadata: { agent_metadata: { workout_source: "hevy", department: "HEALTH" } },
        },
      ]),
    ).toBe(true);
  });

  it("consultation fires on general turns with health context", () => {
    expect(
      shouldConsultHealthOnGeneral({
        userMessage: "thanks",
        recentTurns: [{ role: "user", content: "Pull data from hevy" }],
      }),
    ).toBe(true);
  });

  it("does not flag unrelated messages", () => {
    expect(messageHasHealthSignal("what's on my calendar tomorrow?")).toBe(false);
    expect(looksLikeHealthFitnessIntent("log joy tank 70")).toBe(false);
  });
});
