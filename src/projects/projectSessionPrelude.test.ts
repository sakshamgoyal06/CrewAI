import { beforeEach, describe, expect, it, vi } from "vitest";

const parseMock = vi.fn();
const abandonMock = vi.fn().mockResolvedValue({ ok: true });
const getSessionMock = vi.fn();

vi.mock("./parseProjectSetupTurn.js", () => ({
  parseProjectSetupTurn: (...args: unknown[]) => parseMock(...args),
  projectSetupIntentActionable: (parsed: { intent: string; confidence: number }) => {
    if (parsed.intent === "lock" || parsed.intent === "cancel_setup") {
      return parsed.confidence >= 0.55;
    }
    return true;
  },
}));

vi.mock("./projectSetupFlow.js", () => ({
  runProjectSetupFlow: vi.fn().mockResolvedValue({
    text: "Locked.",
    metadata: { project_locked: true },
  }),
}));

vi.mock("./projectSessionStore.js", () => ({
  getActiveProjectSession: (...args: unknown[]) => getSessionMock(...args),
  abandonProjectSession: (...args: unknown[]) => abandonMock(...args),
}));

import { tryResolveActiveProjectSessionTurn } from "./projectSessionPrelude.js";

describe("tryResolveActiveProjectSessionTurn", () => {
  beforeEach(() => {
    parseMock.mockReset();
    abandonMock.mockClear();
    getSessionMock.mockReset();
  });

  it("abandons draft when parser returns cancel_setup", async () => {
    getSessionMock.mockResolvedValue({
      id: "sess-1",
      user_profile_id: "user-1",
      project_type: "job_search",
      step: "review",
      status: "draft",
    });
    parseMock.mockResolvedValue({
      intent: "cancel_setup",
      confidence: 0.9,
      theme_id: "job_search",
      title: null,
      outcome: null,
      target_date: null,
      checklist: null,
      milestones: null,
      parser: "llm",
    });

    const out = await tryResolveActiveProjectSessionTurn({
      userProfileId: "user-1",
      telegramUserId: "tg-1",
      rawMessage: "Abandon job search. Focus on tomorrow.",
    } as never);

    expect(abandonMock).toHaveBeenCalledWith("sess-1");
    expect(out.handled).toBe(false);
    expect(out.sessionAbandoned).toBe(true);
  });

  it("does not hijack unrelated operational messages", async () => {
    getSessionMock.mockResolvedValue({
      id: "sess-1",
      project_type: "job_search",
      step: "review",
      status: "draft",
    });
    parseMock.mockResolvedValue({
      intent: "show_review",
      confidence: 0.8,
      theme_id: "job_search",
      title: null,
      outcome: null,
      target_date: null,
      checklist: null,
      milestones: null,
      parser: "llm",
    });

    const out = await tryResolveActiveProjectSessionTurn({
      userProfileId: "user-1",
      telegramUserId: "tg-1",
      rawMessage: "What does my day look like tomorrow?",
    } as never);

    expect(out.handled).toBe(false);
    expect(abandonMock).not.toHaveBeenCalled();
  });
});
