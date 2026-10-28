import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const runAgentWithToolsMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/clients.js", () => ({
  anthropic: { messages: { create: createMock } },
}));

vi.mock("./tools/runAgentWithTools.js", () => ({
  runAgentWithTools: (...args: unknown[]) => runAgentWithToolsMock(...args),
}));

import { PILLAR_MODEL, runPillarSpecialist } from "./pillarSpecialist.js";

const baseCtx = {
  userProfileId: "u1",
  telegramUserId: "t1",
  timezone: "Asia/Kolkata",
  rawMessage: "How should I allocate savings?",
  intent: "WEALTH" as const,
};

describe("runPillarSpecialist", () => {
  beforeEach(() => {
    createMock.mockReset();
    runAgentWithToolsMock.mockReset();
  });

  it("uses PILLAR_MODEL for prompt-only turns", () => {
    expect(PILLAR_MODEL).toBe("claude-sonnet-4-6");
  });

  it("delegates to runAgentWithTools when ops tools are enabled", async () => {
    runAgentWithToolsMock.mockResolvedValue({
      text: "Listed your watchlist.",
      metadata: { specialist: "Happiness", tools_used: ["list_items"] },
    });

    const out = await runPillarSpecialist({
      ctx: baseCtx,
      system: "Happiness specialist.",
      specialist: "Happiness",
      pillar: "happiness",
      enableOpsTools: true,
    });

    expect(runAgentWithToolsMock).toHaveBeenCalledOnce();
    expect(createMock).not.toHaveBeenCalled();
    expect(out.text).toContain("watchlist");
  });

  it("runs prompt-only path with no-tools guard when ops tools disabled", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "Advice only — nothing saved." }],
    });

    const out = await runPillarSpecialist({
      ctx: baseCtx,
      system: "Wealth specialist.",
      specialist: "Wealth",
      pillar: "wealth",
      enableOpsTools: false,
    });

    expect(runAgentWithToolsMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledOnce();
    const system = createMock.mock.calls[0][0].system as string;
    expect(system).toMatch(/no tools/i);
    expect(out.metadata?.prompt_only).toBe(true);
    expect(out.text).toContain("Advice only");
  });
});
