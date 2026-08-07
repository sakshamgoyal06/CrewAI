import { describe, expect, it } from "vitest";

import { reconcileConsultationOutputs } from "./agentConsultation.js";

describe("reconcileConsultationOutputs", () => {
  it("prefers health when Magnus denies Hevy but fitness loaded data", () => {
    const out = reconcileConsultationOutputs({
      userMessage: "Pull data from hevy",
      magnus: {
        text: "I don't have a direct Hevy data-pull tool connected.",
        metadata: { specialist: "Magnus" },
      },
      health: {
        text: "Push A — bench 60kg×8, incline 22.5×10.",
        metadata: {
          specialist: "Fitness",
          health_order: "fitness",
          workout_source: "hevy",
          workout_data: "loaded",
        },
      },
    });

    expect(out.primarySource).toBe("health");
    expect(out.text).toContain("bench");
    expect(out.reason).toBe("magnus_denied_hevy_health_had_data");
  });

  it("merges hevy review with magnus check-in write", () => {
    const out = reconcileConsultationOutputs({
      userMessage: "I am done with the workout. Read hevy, review, and log",
      magnus: {
        text: "Logged to daily check-ins.",
        metadata: {
          specialist: "Magnus",
          tools_used: ["log_daily_checkin"],
          tool_outcomes: [{ name: "log_daily_checkin", ok: true, preview: "ok" }],
        },
      },
      health: {
        text: "Solid Pull A — lat pulldown 45kg.",
        metadata: {
          specialist: "Fitness",
          health_order: "fitness",
          workout_source: "hevy",
          workout_data: "loaded",
        },
      },
    });

    expect(out.primarySource).toBe("health");
    expect(out.text).toContain("Pull A");
    expect(out.text).toContain("check-ins");
    expect(out.reason).toBe("merged_hevy_review_and_magnus_write");
  });

  it("keeps magnus when health only generic ack", () => {
    const out = reconcileConsultationOutputs({
      userMessage: "what's on tomorrow?",
      magnus: {
        text: "One meeting at 10.",
        metadata: { specialist: "Magnus" },
      },
      health: {
        text: "Noted — health-related.",
        metadata: { genericAck: true, specialist: "HealthGeneric" },
      },
    });

    expect(out.primarySource).toBe("magnus");
    expect(out.consulted).toEqual(["magnus"]);
  });
});
