import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { pickChatModel } from "./chat.js";

const env = {} as NodeJS.ProcessEnv;

describe("pickChatModel", () => {
  it("sends plain logs to the fast model", () => {
    for (const t of [
      "2 roti and dal for lunch",
      "walked 6000 steps",
      "82.4 this morning",
      "poha and chai",
      "yes",
      "aaj 2 roti aur dal khaya",
      "swam 40 min",
      "did it",
      "yes, 30 min",
      "ate a burrito bowl and a coke",
    ]) {
      expect(pickChatModel(t, env), t).toBe("claude-haiku-5-5");
    }
  });

  it("keeps reasons, slips and states on the main model, since they need an answer", () => {
    for (const t of [
      "skipped gym, knee hurts",
      "skipped the gym",
      "feeling low, binged last night",
      "no, was travelling",
      "same as yesterday",
      "missed my walk today",
      "didn't eat lunch",
      "hungover, ate junk",
    ]) {
      expect(pickChatModel(t, env), t).toBe("claude-sonnet-5-5");
    }
  });

  it("keeps questions and coaching on the main model", () => {
    for (const t of [
      "why am I not losing weight",
      "how am I doing this week",
      "should I eat more on training days",
      "my bench has stalled",
      "what should I have for dinner?",
      "swap squats for leg press",
      "x".repeat(200),
    ]) {
      expect(pickChatModel(t, env), t).toBe("claude-sonnet-5-5");
    }
  });

  it("can be switched off or pointed at other models", () => {
    expect(pickChatModel("poha", { MAGNUS_HEALTH_CHAT_ROUTING: "off" } as NodeJS.ProcessEnv)).toBe("claude-sonnet-5-5");
    expect(pickChatModel("poha", { MAGNUS_HEALTH_CHAT_FAST_MODEL: "claude-sonnet-5-5" } as NodeJS.ProcessEnv)).toBe("claude-sonnet-5-5");
  });
});
