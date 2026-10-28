import { describe, expect, it } from "vitest";

import {
  buildConsultationOutcomeSummary,
  magnusTextForConsultationMerge,
  stripStaleCapabilityDenials,
} from "./consultationOutcome.js";

describe("consultationOutcome", () => {
  it("strips Hevy denial when Health loaded Hevy", () => {
    const summary = buildConsultationOutcomeSummary({
      userMessage: "Check hevy and log",
      magnus: {
        text: "Marked gym done.\n\nI don't have direct Hevy access to pull your session.",
        metadata: {
          tool_outcomes: [{ name: "update_event", ok: true, preview: "Updated: Gym — Push A — done" }],
        },
      },
      pillars: [
        {
          intent: "HEALTH",
          agentName: "HealthComposite",
          result: {
            text: "Push A — bench 60×8.",
            metadata: {
              workout_source: "hevy",
              workout_data: "loaded",
              health_order: "fitness",
            },
          },
        },
      ],
    });

    const merged = magnusTextForConsultationMerge(
      "Marked gym done.\n\nI don't have direct Hevy access to pull your session.",
      { tool_outcomes: [{ name: "update_event", ok: true, preview: "Updated: Gym — Push A — done" }] },
      summary,
    );

    expect(merged.toLowerCase()).not.toMatch(/don't have direct hevy/);
    expect(merged).toMatch(/done/i);
  });

  it("stripStaleCapabilityDenials removes denial paragraphs only", () => {
    const summary = buildConsultationOutcomeSummary({
      userMessage: "pull hevy",
      magnus: { text: "ok", metadata: {} },
      pillars: [
        {
          intent: "HEALTH",
          agentName: "HealthComposite",
          result: {
            text: "data",
            metadata: { workout_source: "hevy", workout_data: "loaded" },
          },
        },
      ],
    });

    const out = stripStaleCapabilityDenials(
      "Great session.\n\nI cannot pull Hevy data directly yet.\n\nRest well.",
      summary,
    );
    expect(out).toContain("Great session");
    expect(out).toContain("Rest well");
    expect(out.toLowerCase()).not.toContain("cannot pull hevy");
  });
});
