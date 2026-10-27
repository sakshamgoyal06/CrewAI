/**
 * Smoke test: turn handler → chat persistence (mocked externals).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordMagnusChatMessage: vi.fn(async () => ({ ok: true as const })),
  resolveTelegramUserProfile: vi.fn(async () => ({
    profileId: "profile-uuid",
    telegramUserId: "999",
    allowlisted: true,
    userTier: "standard",
    accessFlags: { chat: true },
    timezone: "UTC",
  })),
  runOrchestratorReply: vi.fn(async () => ({
    replyText: "Hello from Magnus",
    intent: "GENERAL" as const,
    delegatedAgent: "Magnus",
  })),
  runPostTurnMemoryMaintenance: vi.fn(async () => undefined),
}));

vi.mock("./agents/magnusOrchestrator.js", () => ({
  runOrchestratorReply: mocks.runOrchestratorReply,
}));
vi.mock("./agents/memory/memoryAgent.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agents/memory/memoryAgent.js")>();
  return {
    ...actual,
    runPostTurnMemoryMaintenance: mocks.runPostTurnMemoryMaintenance,
  };
});
vi.mock("./tools/chatLog.js", () => ({
  resolveTelegramUserProfile: mocks.resolveTelegramUserProfile,
  recordMagnusChatMessage: mocks.recordMagnusChatMessage,
  conversationChatFields: () => ({
    message_type: "conversation",
    delivery_trigger: null,
  }),
}));
vi.mock("./proactive/cron.js", () => ({
  scheduleProactiveCron: vi.fn(),
}));

import { handleMessage } from "./magnus.js";

describe("handleMessage smoke", () => {
  afterEach(() => {
    mocks.recordMagnusChatMessage.mockClear();
    mocks.runOrchestratorReply.mockClear();
  });

  it("persists user and assistant turns for an allowlisted user", async () => {
    const chunks = await handleMessage("plan my day", "999", { updateId: 42 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(mocks.runOrchestratorReply).toHaveBeenCalledOnce();
    expect(mocks.recordMagnusChatMessage).toHaveBeenCalledTimes(2);
    expect(mocks.recordMagnusChatMessage.mock.calls[0]?.[0]).toMatchObject({
      role: "user",
      content: "plan my day",
    });
    expect(mocks.recordMagnusChatMessage.mock.calls[1]?.[0]).toMatchObject({
      role: "assistant",
    });
  });

  it("refuses non-allowlisted users without calling the orchestrator", async () => {
    mocks.resolveTelegramUserProfile.mockResolvedValueOnce({
      profileId: "profile-uuid",
      telegramUserId: "888",
      allowlisted: false,
      userTier: "standard",
      accessFlags: { chat: true },
    });
    const chunks = await handleMessage("hi", "888");
    expect(chunks[0]).toContain("not allowlisted");
    expect(mocks.runOrchestratorReply).not.toHaveBeenCalled();
  });
});
