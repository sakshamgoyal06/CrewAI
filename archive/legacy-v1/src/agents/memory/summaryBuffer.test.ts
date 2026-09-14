import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tools/clients.js", () => ({
  anthropic: { messages: { create: vi.fn() } },
  supabase: { from: vi.fn() },
}));

import { resolveMemoryRetrievalProfile } from "./adaptiveRetrieval.js";
import { memoryConfig, resetMemoryConfigForTests } from "./memoryConfig.js";
import {
  excludeDuplicateCurrentUserTurn,
  splitChatTurnsForBuffer,
} from "./summaryBuffer.js";
import type { MemoryChatTurn } from "./types.js";

describe("splitChatTurnsForBuffer", () => {
  it("keeps the newest turns verbatim", () => {
    const turns: MemoryChatTurn[] = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn-${i}`,
      intent: null,
      createdAt: `t${i}`,
    }));
    const { verbatim, older } = splitChatTurnsForBuffer(turns, 2);
    expect(older).toHaveLength(3);
    expect(verbatim.map((t) => t.content)).toEqual(["turn-3", "turn-4"]);
  });
});

describe("excludeDuplicateCurrentUserTurn", () => {
  it("drops trailing user row matching rawMessage", () => {
    const turns: MemoryChatTurn[] = [
      { role: "assistant", content: "ok", intent: null, createdAt: "t1" },
      { role: "user", content: "same text", intent: null, createdAt: "t2" },
    ];
    expect(excludeDuplicateCurrentUserTurn(turns, "same text")).toHaveLength(1);
  });
});

describe("resolveMemoryRetrievalProfile", () => {
  afterEach(() => {
    resetMemoryConfigForTests();
  });

  it("narrows block for calendar-heavy GENERAL turns", () => {
    const profile = resolveMemoryRetrievalProfile(
      "GENERAL",
      "What's on my calendar tomorrow?",
      memoryConfig(),
    );
    expect(profile.includePatterns).toBe(false);
    expect(profile.memoryBlockMaxChars).toBeLessThanOrEqual(3000);
  });
});
