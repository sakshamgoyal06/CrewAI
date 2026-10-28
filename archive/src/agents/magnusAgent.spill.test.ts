import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const readCalendarMock = vi.hoisted(() => vi.fn());
const redisStore = vi.hoisted(() => new Map<string, string>());

vi.mock("../tools/clients.js", () => ({
  anthropic: { messages: { create: createMock } },
  supabase: {},
  redis: {
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  },
}));

vi.mock("./tools/calendarTool.js", () => ({
  readCalendarEvents: readCalendarMock,
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

vi.mock("./memory/memoryAgent.js", () => ({
  buildAgentMessages: (_ctx: unknown, content: string) => [{ role: "user" as const, content }],
  augmentUserWithMemory: (msg: string) => msg,
}));

import { runMagnusAgent } from "./magnusAgent.js";
import { estimateTokens, resetToolResultSpillConfigForTests } from "./tools/toolResultSpill.js";

const CTX = {
  userProfileId: "00000000-0000-0000-0000-000000000001",
  telegramUserId: "1",
  timezone: "Asia/Kolkata",
  rawMessage: "show my whole calendar this week",
  intent: "GENERAL" as const,
};

function calendarEventLine(i: number): string {
  return `- Mon ${i} Sep 09:00–10:00 — Meeting ${i} — ${"agenda item ".repeat(6)}@ Room ${i} [id: evt-${i}]`;
}

describe("runMagnusAgent tool result spill", () => {
  beforeEach(() => {
    createMock.mockReset();
    readCalendarMock.mockReset();
    redisStore.clear();
    process.env.MAGNUS_TOOL_RESULT_SPILL_CHARS = "4000";
    resetToolResultSpillConfigForTests();
  });

  it("spills large read_calendar output in the tool loop", async () => {
    const body = Array.from({ length: 50 }, (_, i) => calendarEventLine(i + 1)).join("\n");
    readCalendarMock.mockResolvedValue(body);

    createMock
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            id: "tool_1",
            name: "read_calendar",
            input: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "You have 50 meetings this week." }],
      });

    const out = await runMagnusAgent(CTX);

    expect(out.text).toContain("50 meetings");
    const secondCall = createMock.mock.calls[1]?.[0] as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    const userMessages = (secondCall?.messages ?? []).filter((m) => m.role === "user");
    const lastUser = userMessages[userMessages.length - 1];
    const toolResult = Array.isArray(lastUser?.content)
      ? (lastUser.content as Array<{ content?: string }>)[0]?.content ?? ""
      : "";
    expect(toolResult).toContain('"spilled":true');
    expect(toolResult).toContain('"count":50');
    expect(estimateTokens(toolResult)).toBeLessThan(8000);
    expect(redisStore.size).toBe(1);
  });
});
