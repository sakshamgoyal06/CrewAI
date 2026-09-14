import { describe, expect, it, vi } from "vitest";

vi.mock("../../tools/clients.js", () => ({
  anthropic: { messages: { create: vi.fn() } },
  supabase: { from: vi.fn() },
  redis: {},
}));

import { matchesHealthJournalMessage } from "./healthJournalAgent.js";

describe("matchesHealthJournalMessage", () => {
  it("matches journal phrases", () => {
    expect(matchesHealthJournalMessage("lets journal today")).toBe(true);
    expect(matchesHealthJournalMessage("EOD review — rested")).toBe(true);
    expect(matchesHealthJournalMessage("bench press form")).toBe(false);
  });

  it("matches /journal slash", () => {
    expect(matchesHealthJournalMessage("rest day tired", "journal")).toBe(true);
  });
});
