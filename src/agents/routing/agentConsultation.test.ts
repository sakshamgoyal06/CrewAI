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
      pillars: [
        {
          intent: "HEALTH",
          agentName: "HealthComposite",
          result: {
            text: "Push A — bench 60kg×8, incline 22.5×10.",
            metadata: {
              specialist: "Fitness",
              health_order: "fitness",
              workout_source: "hevy",
              workout_data: "loaded",
            },
          },
        },
      ],
    });

    expect(out.primarySource).toBe("HEALTH");
    expect(out.text).toContain("bench");
    expect(out.reason).toBe("magnus_denied_health_capability");
  });

  it("prefers wealth when Magnus denies Kite but portfolio loaded", () => {
    const out = reconcileConsultationOutputs({
      userMessage: "show my portfolio",
      magnus: {
        text: "I can't fetch your Zerodha portfolio directly.",
        metadata: { specialist: "Magnus" },
      },
      pillars: [
        {
          intent: "WEALTH",
          agentName: "Wealth",
          result: {
            text: "Equity allocation: 62% large cap, 18% mid.",
            metadata: { specialist: "Wealth", kite: "loaded" },
          },
        },
      ],
    });

    expect(out.primarySource).toBe("WEALTH");
    expect(out.text).toContain("allocation");
    expect(out.reason).toBe("magnus_denied_wealth_capability");
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
      pillars: [
        {
          intent: "HEALTH",
          agentName: "HealthComposite",
          result: {
            text: "Solid Pull A — lat pulldown 45kg.",
            metadata: {
              specialist: "Fitness",
              health_order: "fitness",
              workout_source: "hevy",
              workout_data: "loaded",
            },
          },
        },
      ],
    });

    expect(out.primarySource).toBe("HEALTH");
    expect(out.text).toContain("Pull A");
    expect(out.text).toContain("check-ins");
    expect(out.reason).toBe("merged_hevy_review_and_magnus_write");
  });

  it("keeps magnus when pillars only generic or empty", () => {
    const out = reconcileConsultationOutputs({
      userMessage: "what's on tomorrow?",
      magnus: {
        text: "One meeting at 10.",
        metadata: { specialist: "Magnus" },
      },
      pillars: [
        {
          intent: "HEALTH",
          agentName: "HealthComposite",
          result: {
            text: "Noted — health-related.",
            metadata: { genericAck: true, specialist: "HealthGeneric" },
          },
        },
      ],
    });

    expect(out.primarySource).toBe("magnus");
    expect(out.consulted).toEqual(["magnus"]);
  });

  it("merges two strong pillar answers when scores are close", () => {
    const out = reconcileConsultationOutputs({
      userMessage: "gym session and portfolio check",
      magnus: {
        text: "Let me check both.",
        metadata: { specialist: "Magnus" },
      },
      pillars: [
        {
          intent: "HEALTH",
          agentName: "HealthComposite",
          result: {
            text: "Push A looked solid — progressive overload on bench.",
            metadata: {
              specialist: "Fitness",
              health_order: "fitness",
              workout_source: "hevy",
              workout_data: "loaded",
            },
          },
        },
        {
          intent: "WEALTH",
          agentName: "Wealth",
          result: {
            text: "Portfolio drift: equity 4% above target.",
            metadata: { specialist: "Wealth", kite: "loaded" },
          },
        },
      ],
    });

    expect(out.reason).toBe("merged_multi_pillar");
    expect(out.text).toContain("Push A");
    expect(out.text).toContain("drift");
  });
});
