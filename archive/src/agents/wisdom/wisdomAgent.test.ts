import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.hoisted(() => vi.fn());
const executeMock = vi.hoisted(() => vi.fn());
const hintsMock = vi.hoisted(() => vi.fn());

vi.mock("../routing/pillarStrategy/buildRoutingHints.js", () => ({
  buildRoutingHints: (...args: unknown[]) => hintsMock(...args),
}));

vi.mock("../routing/pillarStrategy/parsePillarStrategy.js", () => ({
  parsePillarExecutionPlan: (...args: unknown[]) => parseMock(...args),
}));

vi.mock("../routing/pillarStrategy/executeWisdomStrategy.js", () => ({
  executeWisdomStrategy: (...args: unknown[]) => executeMock(...args),
}));

import { WISDOM_SYSTEM, runWisdomAgent, wisdomAgent } from "./wisdomAgent.js";

describe("wisdomAgent", () => {
  beforeEach(() => {
    parseMock.mockReset();
    executeMock.mockReset();
    hintsMock.mockReset();
    hintsMock.mockResolvedValue({});
  });

  it("exports WISDOM_SYSTEM with shipping and career focus", () => {
    expect(WISDOM_SYSTEM).toMatch(/learning plans/i);
    expect(WISDOM_SYSTEM).toMatch(/career/i);
    expect(WISDOM_SYSTEM).toMatch(/smallest next step/i);
  });

  it("registers as WISDOM department agent", () => {
    expect(wisdomAgent.departmentId).toBe("WISDOM");
    expect(wisdomAgent.name).toBe("Wisdom");
  });

  it("runWisdomAgent parses plan and executes wisdom strategy", async () => {
    const plan = {
      steps: [{ capability: "learning_plan", args: {} }],
      confidence: 1,
      parser: "llm" as const,
    };
    parseMock.mockResolvedValue(plan);
    executeMock.mockResolvedValue({
      text: "Ship the API doc first.",
      metadata: { specialist: "Wisdom" },
    });

    const ctx = {
      userProfileId: "u1",
      telegramUserId: "t1",
      rawMessage: "How do I unblock this project?",
      intent: "WISDOM" as const,
    };

    const out = await runWisdomAgent(ctx);
    expect(parseMock).toHaveBeenCalledWith("WISDOM", ctx.rawMessage, {});
    expect(executeMock).toHaveBeenCalled();
    expect(out.text).toContain("API doc");
  });
});
