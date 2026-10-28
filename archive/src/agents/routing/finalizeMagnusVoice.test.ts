import { beforeEach, describe, expect, it, vi } from "vitest";

const composeMock = vi.fn();

vi.mock("./pillarStrategy/composePillarPlanReply.js", () => ({
  composePillarPlanReply: (...args: unknown[]) => composeMock(...args),
}));

vi.mock("./pillarStrategy/parsePillarStrategy.js", () => ({
  pillarPlanComposeEnabled: () => true,
}));

import { finalizeMagnusVoice, magnusVoiceAlreadyFinalized } from "./finalizeMagnusVoice.js";

describe("finalizeMagnusVoice", () => {
  beforeEach(() => {
    composeMock.mockReset();
    composeMock.mockResolvedValue("Composed Magnus reply.");
  });

  const ctx = {
    userProfileId: "u1",
    telegramUserId: "t1",
    rawMessage: "hello",
    intent: "GENERAL" as const,
  };

  it("skips when already finalized", async () => {
    expect(magnusVoiceAlreadyFinalized({ magnus_voice_finalized: true })).toBe(true);
    const out = await finalizeMagnusVoice(ctx, "raw", { magnus_voice_finalized: true });
    expect(out.text).toBe("raw");
    expect(composeMock).not.toHaveBeenCalled();
  });

  it("skips when pillar_compose is false", async () => {
    const out = await finalizeMagnusVoice(ctx, "OAuth link", { pillar_compose: false });
    expect(out.text).toBe("OAuth link");
    expect(out.metadata.magnus_voice_finalized).toBe(true);
    expect(composeMock).not.toHaveBeenCalled();
  });

  it("composes specialist output into Magnus voice", async () => {
    const out = await finalizeMagnusVoice(ctx, "Specialist: here is your plan…", {
      specialist: "MealPlanner",
    });
    expect(out.text).toBe("Composed Magnus reply.");
    expect(out.metadata.magnus_voice_finalized).toBe(true);
    expect(composeMock).toHaveBeenCalledTimes(1);
  });
});
