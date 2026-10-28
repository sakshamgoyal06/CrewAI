import { describe, expect, it } from "vitest";

import { normalizeRoutingRecentTurns } from "./normalizeRecentTurns.js";

describe("normalizeRoutingRecentTurns", () => {
  it("preserves intent, delegated agent, and tools for continuations", () => {
    const turns = normalizeRoutingRecentTurns([
      {
        role: "assistant",
        content: "Want me to add both to your Wisdom playlist?",
        metadata: {
          delegated_agent: "Magnus",
          intent: "GENERAL",
          tools_used: ["youtube_search", "youtube_add_to_playlist"],
        },
      },
      { role: "user", content: "Yes add both", metadata: null },
    ]);

    expect(turns[0]?.delegatedAgent).toBe("Magnus");
    expect(turns[0]?.toolsUsed).toEqual(["youtube_search", "youtube_add_to_playlist"]);
    expect(turns[1]?.role).toBe("user");
  });

  it("truncates long content", () => {
    const long = "x".repeat(500);
    const [turn] = normalizeRoutingRecentTurns([{ role: "user", content: long, metadata: null }]);
    expect(turn?.content.length).toBeLessThan(500);
    expect(turn?.content.endsWith("…")).toBe(true);
  });
});
