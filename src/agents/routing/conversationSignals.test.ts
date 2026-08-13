import { describe, expect, it } from "vitest";

import { buildConversationSignals } from "./conversationSignals.js";

describe("conversationSignals", () => {
  it("flags holistic day asks without meal plan keyword", () => {
    expect(buildConversationSignals("Whats the plan for tomorrow?").holistic_day_ask).toBe(true);
    expect(buildConversationSignals("Whats my meal plan for tomorrow").holistic_day_ask).toBe(false);
  });

  it("flags treadmill watch from saved library", () => {
    expect(
      buildConversationSignals("What should i watch for treadmill tomorrow").saved_media_pick,
    ).toBe(true);
    expect(
      buildConversationSignals("No something from my wisdom youtube playlist").saved_media_pick,
    ).toBe(true);
  });

  it("flags calendar accuracy challenges", () => {
    expect(
      buildConversationSignals("Cant you check using calendar connections?").schedule_accuracy_challenge,
    ).toBe(true);
  });

  it("flags compound multi-intent asks", () => {
    expect(
      buildConversationSignals("Add this to my calendar. And suggest the youtube video for treadmill")
        .compound_action,
    ).toBe(true);
  });
});
