import { describe, expect, it } from "vitest";

import { buildConversationMessages } from "./conversationMessages.js";
import type { MemoryChatTurn } from "./types.js";

describe("buildConversationMessages", () => {
  it("includes older summary, verbatim turns, and memory on the last user message", () => {
    const turns: MemoryChatTurn[] = [
      { role: "user", content: "Add my Tuesday plan", intent: "GENERAL", createdAt: "t1" },
      { role: "assistant", content: "Please paste the plan.", intent: "GENERAL", createdAt: "t2" },
    ];
    const messages = buildConversationMessages({
      verbatimTurns: turns,
      olderSummary: "- User wanted calendar blocks for Tuesday",
      currentUserContent: "Here is the plan again…",
      memoryBlock: "Timezone: Asia/Kolkata",
    });
    expect(messages).toHaveLength(5);
    expect(messages[0]?.role).toBe("user");
    expect(String(messages[0]?.content)).toContain("Earlier conversation summary");
    expect(messages[2]?.content).toBe("Add my Tuesday plan");
    expect(String(messages[4]?.content)).toContain("Magnus memory");
    expect(String(messages[4]?.content)).toContain("Here is the plan again");
  });
});
