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

vi.mock("../routing/pillarStrategy/executeWealthStrategy.js", () => ({
  executeWealthStrategy: (...args: unknown[]) => executeMock(...args),
}));

import { WEALTH_SYSTEM, runWealthAgent, wealthAgent } from "./wealthAgent.js";

describe("wealthAgent", () => {
  beforeEach(() => {
    parseMock.mockReset();
    executeMock.mockReset();
    hintsMock.mockReset();
    hintsMock.mockResolvedValue({ meal_session: false });
  });

  it("exports roster-aligned WEALTH_SYSTEM guardrails", () => {
    expect(WEALTH_SYSTEM).toMatch(/read-only/i);
    expect(WEALTH_SYSTEM).toMatch(/no orders/i);
    expect(WEALTH_SYSTEM).not.toMatch(/buy this stock/i);
  });

  it("registers as WEALTH department agent", () => {
    expect(wealthAgent.departmentId).toBe("WEALTH");
    expect(wealthAgent.name).toBe("Wealth");
  });

  it("runWealthAgent parses plan and executes wealth strategy", async () => {
    const plan = {
      steps: [{ capability: "wealth_coaching", args: {} }],
      confidence: 1,
      parser: "llm" as const,
    };
    parseMock.mockResolvedValue(plan);
    executeMock.mockResolvedValue({
      text: "Hold cash buffer first.",
      metadata: { specialist: "Wealth" },
    });

    const ctx = {
      userProfileId: "u1",
      telegramUserId: "t1",
      rawMessage: "Should I invest more?",
      intent: "WEALTH" as const,
    };

    const out = await runWealthAgent(ctx);
    expect(hintsMock).toHaveBeenCalledWith(ctx);
    expect(parseMock).toHaveBeenCalledWith("WEALTH", ctx.rawMessage, { meal_session: false });
    expect(executeMock).toHaveBeenCalled();
    expect(out.text).toContain("cash buffer");
  });
});
