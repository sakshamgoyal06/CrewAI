import { afterEach, describe, expect, it, vi } from "vitest";

import { resetMemoryConfigForTests } from "./memoryConfig.js";
import {
  parseMemoryTopicCommand,
  tryHandleMemoryTopicCommand,
} from "./memoryTopicCommands.js";

vi.mock("./memoryTopics.js", () => ({
  loadMemoryTopics: vi.fn(),
  rememberMemoryTopic: vi.fn(),
  deleteMemoryTopicByKey: vi.fn(),
  resolveForgetTopics: vi.fn(),
}));

import {
  deleteMemoryTopicByKey,
  loadMemoryTopics,
  rememberMemoryTopic,
  resolveForgetTopics,
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
    vi.mocked(resolveForgetTopics).mockResolvedValue({
      status: "clear",
      matches: [
        {
          topic: {
            id: "1",
            user_profile_id: "u",
            topic_key: "schedule:gym",
            label: "Gym",
            body: "Gym",
            source: "user",
            created_at: "",
            updated_at: "",
          },
          score: 0.9,
          signals: { phrase: 1, topicKey: 0, tokenCoverage: 1, semantic: 0 },
        },
      ],
    });
    vi.mocked(deleteMemoryTopicByKey).mockResolvedValue(true);

    const result = await tryHandleMemoryTopicCommand("u", "forget gym");
    expect(result).toEqual({
      handled: true,
      replyText: 'Forgot 1 memory topic matching "gym".',
    });
  });

  it("asks for disambiguation when multiple topics match", async () => {
    vi.mocked(resolveForgetTopics).mockResolvedValue({
      status: "ambiguous",
      matches: [
        {
          topic: {
            id: "1",
            user_profile_id: "u",
            topic_key: "a",
            label: "Gym morning",
            body: "",
            source: null,
            created_at: "",
            updated_at: "",
          },
          score: 0.7,
          signals: { phrase: 0, topicKey: 0, tokenCoverage: 1, semantic: 0 },
        },
        {
          topic: {
            id: "2",
            user_profile_id: "u",
            topic_key: "b",
            label: "Gym evening",
            body: "",
            source: null,
            created_at: "",
            updated_at: "",
          },
          score: 0.68,
          signals: { phrase: 0, topicKey: 0, tokenCoverage: 1, semantic: 0 },
        },
      ],
    });

    const result = await tryHandleMemoryTopicCommand("u", "forget gym");
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("several memory topics");
      expect(result.replyText).toContain("Gym morning");
    }
  });

  it("returns not handled for normal chat", async () => {
    const result = await tryHandleMemoryTopicCommand("u", "book dentist Friday");
    expect(result).toEqual({ handled: false });
  });
});
