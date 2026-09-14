import { describe, expect, it } from "vitest";

import {
  automatedChatFields,
  conversationChatFields,
  manualTriggerRequestFields,
} from "./chatMessageTypes.js";

describe("chatMessageTypes", () => {
  it("conversation rows have no delivery trigger", () => {
    expect(conversationChatFields()).toEqual({
      message_type: "conversation",
      delivery_trigger: null,
    });
  });

  it("automated rows carry delivery trigger", () => {
    expect(automatedChatFields("scheduled")).toEqual({
      message_type: "automated",
      delivery_trigger: "scheduled",
    });
    expect(automatedChatFields("event_reminder").delivery_trigger).toBe("event_reminder");
  });

  it("manual ritual request is conversation with manual trigger", () => {
    expect(manualTriggerRequestFields()).toEqual({
      message_type: "conversation",
      delivery_trigger: "manual",
    });
  });
});
