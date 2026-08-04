import { describe, expect, it } from "vitest";

import { looksLikeMagnusToolContinuation } from "./magnusToolContinuation.js";

describe("looksLikeMagnusToolContinuation", () => {
  it("detects short yes after youtube tool use", () => {
    expect(
      looksLikeMagnusToolContinuation("Yes", [
        {
          role: "assistant",
          content: "Want me to add these?",
          metadata: { tools_used: ["youtube_search", "youtube_playlist"] },
        },
      ]),
    ).toBe(true);
  });

  it("detects list follow-up after list tool use", () => {
    expect(
      looksLikeMagnusToolContinuation("Yes, add it", [
        {
          role: "assistant",
          content: "Want me to add Dune to your readlist?",
          metadata: { tools_used: ["list_items"] },
        },
      ]),
    ).toBe(true);
  });

  it("detects playlist maintenance phrases not already caught by youtube detect", () => {
    expect(looksLikeMagnusToolContinuation("dedupe wealth", [])).toBe(true);
  });

  it("detects add RAG topic without youtube keyword", () => {
    expect(looksLikeMagnusToolContinuation("Yes, add RAG and vector databases", [])).toBe(true);
  });

  it("ignores unrelated affirmatives", () => {
    expect(
      looksLikeMagnusToolContinuation("Yes", [
        { role: "assistant", content: "Your gym today is Push A.", metadata: {} },
      ]),
    ).toBe(false);
  });
});
