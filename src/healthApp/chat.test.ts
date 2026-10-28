import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const actions = vi.hoisted(() => ({
  startMealDraft: vi.fn(),
  logSteps: vi.fn(async () => ({ ok: true, date: "2026-10-27", steps: 9000 })),
}));

vi.mock("../tools/clients.js", () => ({
  supabase: {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        saved.push(row);
        return { error: null };
      },
    }),
  },
  redis: {},
  anthropic: {},
}));
vi.mock("./snapshot.js", () => ({ buildHealthSnapshot: vi.fn() }));
vi.mock("./actions.js", async (orig) => {
  const real = await orig<typeof import("./actions.js")>();
  return { ...real, startMealDraft: actions.startMealDraft, logSteps: actions.logSteps };
});

import { historyToMessages, runHealthChat } from "./chat.js";

const ctx = { userProfileId: "profile-1", timezone: "UTC", now: new Date("2026-10-27T08:00:00Z") };

function msg(content: Anthropic.ContentBlock[], stop: string): Anthropic.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "test",
    content,
    stop_reason: stop as Anthropic.Message["stop_reason"],
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Usage,
  };
}

const draft = {
  draftId: "7b0c7a8e-2f55-4a8e-9a3b-0b6c1f1d2e3f",
  text: "2 eggs",
  slot: "breakfast",
  source: "usda_fdc",
  items: [{ name: "2 eggs", calories: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 }],
  totals: { calories: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 },
  estimated: true,
  servingAssumption: null,
};

beforeEach(() => {
  saved.length = 0;
  actions.startMealDraft.mockReset().mockResolvedValue(draft);
  actions.logSteps.mockClear();
});

describe("runHealthChat", () => {
  it("drafts a meal through the tool and returns it as a card without logging it", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const create = vi
      .fn()
      .mockImplementationOnce(async (p: Record<string, unknown>) => {
        calls.push(structuredClone(p));
        return msg(
          [{ type: "tool_use", id: "t1", name: "draft_meal", input: { text: "2 eggs" } } as Anthropic.ToolUseBlock],
          "tool_use",
        );
      })
      .mockImplementationOnce(async (p: Record<string, unknown>) => {
        calls.push(structuredClone(p));
        return msg([{ type: "text", text: "About 143 kcal. Check the card and confirm.", citations: null } as Anthropic.TextBlock], "end_turn");
      });

    const reply = await runHealthChat(ctx, "had 2 eggs", { create, history: [] });

    expect(reply.text).toBe("About 143 kcal. Check the card and confirm.");
    expect(reply.cards).toEqual([{ type: "meal_draft", draft }]);
    expect(reply.changed).toBe(false);
    expect(actions.startMealDraft).toHaveBeenCalledWith(ctx, { text: "2 eggs" });

    // Second request carries the assistant tool_use turn and the tool_result.
    const second = calls[1]!.messages as Anthropic.MessageParam[];
    expect(second.at(-2)?.role).toBe("assistant");
    const toolResult = (second.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(toolResult.tool_use_id).toBe("t1");
    expect(JSON.parse(toolResult.content as string)).toMatchObject({ shownToUserAsCard: true });

    expect(saved.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(saved[1]!.cards).toEqual([{ type: "meal_draft", draft }]);
  });

  it("logs steps directly and marks the turn as changed", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        msg([{ type: "tool_use", id: "t1", name: "log_steps", input: { steps: 9000 } } as Anthropic.ToolUseBlock], "tool_use"),
      )
      .mockResolvedValueOnce(msg([{ type: "text", text: "Saved 9,000 steps.", citations: null } as Anthropic.TextBlock], "end_turn"));
    const reply = await runHealthChat(ctx, "9000 steps today", { create, history: [] });
    expect(reply.changed).toBe(true);
    expect(actions.logSteps).toHaveBeenCalledWith(ctx, { steps: 9000, source: "manual" });
  });

  it("returns invalid input to the model instead of saving", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        msg([{ type: "tool_use", id: "t1", name: "log_steps", input: { steps: -4 } } as Anthropic.ToolUseBlock], "tool_use"),
      )
      .mockResolvedValueOnce(msg([{ type: "text", text: "That number looks off.", citations: null } as Anthropic.TextBlock], "end_turn"));
    const reply = await runHealthChat(ctx, "-4 steps", { create, history: [] });
    expect(actions.logSteps).not.toHaveBeenCalled();
    expect(reply.changed).toBe(false);
  });

  it("handles a refusal without crashing", async () => {
    const create = vi.fn().mockResolvedValueOnce(msg([], "refusal"));
    const reply = await runHealthChat(ctx, "something", { create, history: [] });
    expect(reply.text).toMatch(/can't help/);
  });
});

describe("historyToMessages", () => {
  it("drops leading assistant turns and empty messages", () => {
    expect(
      historyToMessages([
        { role: "assistant", content: "hi" },
        { role: "user", content: "" },
        { role: "user", content: "log steps" },
        { role: "assistant", content: "done" },
      ]),
    ).toEqual([
      { role: "user", content: "log steps" },
      { role: "assistant", content: "done" },
    ]);
  });
});
