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

import { dropPhantomCardMentions, historyToMessages, mealDraftReply, runHealthChat } from "./chat.js";

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
  it("drafts a meal through the tool and answers without a second model call", async () => {
    const create = vi.fn().mockResolvedValueOnce(
      msg(
        [{ type: "tool_use", id: "t1", name: "draft_meal", input: { text: "2 eggs" } } as Anthropic.ToolUseBlock],
        "tool_use",
      ),
    );

    const reply = await runHealthChat(ctx, "had 2 eggs", { create, history: [] });

    expect(create).toHaveBeenCalledTimes(1);
    expect(reply.text).toBe(
      "That comes to about 143 kcal and 13 g protein for breakfast. Check the card, fix anything that's off, then tap Confirm & log.",
    );
    expect(reply.text).not.toMatch(/logged|saved/i);
    expect(reply.cards).toEqual([{ type: "meal_draft", draft }]);
    expect(reply.changed).toBe(false);
    expect(actions.startMealDraft).toHaveBeenCalledWith(ctx, { text: "2 eggs" });

    expect(saved.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(saved[1]!.cards).toEqual([{ type: "meal_draft", draft }]);
  });

  it("asks the person to fill in numbers when no estimate was found", () => {
    expect(mealDraftReply([{ ...draft, estimated: false, items: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } }])).toMatch(
      /couldn't find reliable numbers/,
    );
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
    const create = vi.fn().mockResolvedValue(msg([], "refusal"));
    const reply = await runHealthChat(ctx, "something", { create, history: [] });
    expect(reply.text).toMatch(/can't help/);
    // A short message starts on the fast model; its refusal is retried once on the main model.
    expect(create.mock.calls.map((c) => c[0].model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
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

describe("card history notes", () => {
  const meal = {
    type: "meal_draft" as const,
    draft: {
      draftId: "meal-1",
      text: "Burrito bowl with rice, paneer, rajma",
      slot: "dinner" as const,
      source: "web_research" as const,
      items: [],
      totals: { calories: 770, protein_g: 36, carbs_g: 0, fat_g: 0 },
      estimated: true,
      servingAssumption: null,
    },
  };

  it("tells the model whether an earlier meal card was logged", () => {
    const msgs = historyToMessages(
      [
        { role: "user", content: "I had burrito bowl" },
        { role: "assistant", content: "Check the card, then tap Confirm & log.", cards: [meal] },
      ],
      new Set(["meal-1"]),
    );
    expect(msgs[1]!.content).toContain('[Meal card "Burrito bowl with rice, paneer, rajma", about 770 kcal: logged]');
    const unsaved = historyToMessages([
      { role: "user", content: "x" },
      { role: "assistant", content: "Check the card.", cards: [meal] },
    ]);
    expect(unsaved[1]!.content).toContain("never confirmed, not logged");
  });
});

describe("dropPhantomCardMentions", () => {
  const hevy = { type: "hevy_proposal" } as unknown as Parameters<typeof dropPhantomCardMentions>[1][number];

  it("drops a meal-card line from a reply that only has a Hevy card", () => {
    const text = "Tell me if you want the same changes there.\n\nPlease also check the burrito bowl card and confirm it if it looks right.";
    expect(dropPhantomCardMentions(text, [hevy])).toBe("Tell me if you want the same changes there.");
  });

  it("keeps the Hevy card line", () => {
    const text = "I put the change on a card. Apply it when ready.";
    expect(dropPhantomCardMentions(text, [hevy])).toBe(text);
  });

  it("drops any card mention when no card is shown", () => {
    expect(dropPhantomCardMentions("You're on track. Check the card above.", [])).toBe("You're on track.");
  });

  it("leaves a reply with a meal card alone", () => {
    const meal = { type: "meal_draft" } as unknown as Parameters<typeof dropPhantomCardMentions>[1][number];
    expect(dropPhantomCardMentions("Check the card and confirm.", [meal])).toBe("Check the card and confirm.");
  });
});
