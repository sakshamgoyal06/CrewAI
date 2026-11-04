import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { _resetDeclines, brakeOn, countDecline, looksHealthRelated, offTopicLimit, seedDeclines } from "./offTopic.js";

const U = "p1";
const D = "2026-11-04";

beforeEach(() => _resetDeclines());

describe("off-topic brake", () => {
  it("tells health messages from the rest", () => {
    for (const t of ["had 2 roti for lunch", "walked 8000 steps", "how much protein in paneer", "slept badly, tired", "81.9 weight today"]) {
      expect(looksHealthRelated(t), t).toBe(true);
    }
    for (const t of ["write a cover letter", "capital of Australia", "explain quantum physics", "help with my SQL join"]) {
      expect(looksHealthRelated(t), t).toBe(false);
    }
  });

  it("turns on after the day's limit, only for non-health messages, and resets the next day", () => {
    for (let i = 0; i < 4; i++) countDecline(U, D);
    expect(brakeOn(U, D, "write a poem")).toBe(false);
    countDecline(U, D);
    expect(brakeOn(U, D, "write a poem")).toBe(true);
    expect(brakeOn(U, D, "had dal rice for lunch")).toBe(false);
    expect(brakeOn(U, "2026-11-05", "write a poem")).toBe(false);
  });

  it("seeds from the log and can be turned off", () => {
    seedDeclines(U, D, 7);
    expect(brakeOn(U, D, "write a poem")).toBe(true);
    expect(brakeOn(U, D, "write a poem", { MAGNUS_OFF_TOPIC_LIMIT: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(offTopicLimit({} as NodeJS.ProcessEnv)).toBe(5);
  });
});
