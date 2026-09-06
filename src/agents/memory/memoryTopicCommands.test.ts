import { afterEach, describe, expect, it, vi } from "vitest";

import { resetMemoryConfigForTests } from "./memoryConfig.js";
import {
  parseMemoryTopicCommand,
  tryHandleMemoryTopicCommand,
} from "./memoryTopicCommands.js";

vi.mock("./memoryTopics.js", () => ({
  loadMemoryTopics: vi.fn(),
  rememberMemoryTopic: vi.fn(),
  deleteMemoryTopicsMatching: vi.fn(),
}));

import {
  deleteMemoryTopicsMatching,
  loadMemoryTopics,
  rememberMemoryTopic,
} from "./memoryTopics.js";

describe("parseMemoryTopicCommand", () => {
  it("parses show commands", () => {
    expect(parseMemoryTopicCommand("what do you remember?")).toEqual({ kind: "show" });
    expect(parseMemoryTopicCommand("show my memories")).toEqual({ kind: "show" });
  });

  it("parses forget commands", () => {
    expect(parseMemoryTopicCommand("forget peanuts")).toEqual({
      kind: "forget",
      query: "peanuts",
    });
    expect(parseMemoryTopicCommand("don't remember gym schedule")).toEqual({
      kind: "forget",
      query: "gym schedule",
    });
  });

  it("parses remember commands", () => {
    expect(parseMemoryTopicCommand("remember that I hate lauki")).toEqual({
      kind: "remember",
      body: "I hate lauki",
    });
  });

  it("returns null for unrelated messages", () => {
    expect(parseMemoryTopicCommand("what's on my calendar?")).toBeNull();
  });
});

describe("tryHandleMemoryTopicCommand", () => {
  afterEach(() => {
    delete process.env.MAGNUS_MEMORY_TOPICS_ENABLED;
    resetMemoryConfigForTests();
    vi.clearAllMocks();
  });

  it("lists topics on show", async () => {
    vi.mocked(loadMemoryTopics).mockResolvedValue([
      {
        id: "1",
        user_profile_id: "u",
        topic_key: "preference:dal",
        label: "Likes dal",
        body: "Likes dal for dinner",
        source: "user",
        created_at: "",
        updated_at: "",
      },
    ]);

    const result = await tryHandleMemoryTopicCommand("u", "what do you remember?");
    expect(result).toEqual({
      handled: true,
      replyText: "Here's what I remember:\n- Likes dal",
    });
  });

  it("remembers a topic", async () => {
    vi.mocked(rememberMemoryTopic).mockResolvedValue({
      topicKey: "preference:dal",
      label: "Likes dal",
      body: "Likes dal",
      source: "user",
    });

    const result = await tryHandleMemoryTopicCommand("u", "remember I like dal");
    expect(result.handled).toBe(true);
    expect(rememberMemoryTopic).toHaveBeenCalledWith("u", "I like dal");
  });

  it("forgets matching topics", async () => {
    vi.mocked(deleteMemoryTopicsMatching).mockResolvedValue(2);

    const result = await tryHandleMemoryTopicCommand("u", "forget gym");
    expect(result).toEqual({
      handled: true,
      replyText: 'Forgot 2 memory topics matching "gym".',
    });
  });

  it("returns not handled for normal chat", async () => {
    const result = await tryHandleMemoryTopicCommand("u", "book dentist Friday");
    expect(result).toEqual({ handled: false });
  });
});
