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

  it("knows plural and progress questions are about health", () => {
    for (const t of ["am I on track for my goal?", "how many calories left", "plan my meals", "my macros look off", "2 eggs and toast", "is my weight progress ok", "log 3 workouts"]) {
      expect(looksHealthRelated(t), t).toBe(true);
    }
    for (const t of ["write a python script to sort a list", "random trivia please", "translate this email"]) {
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

describe("strikes after the brake", async () => {
  const { strikeState, warningLine } = await import("./offTopic.js");
  it("warns from the 5th decline with the strikes left, and pauses at the 8th", () => {
    expect(strikeState(4)).toEqual({ kind: "ok" });
    expect(strikeState(5)).toEqual({ kind: "warn", left: 3 });
    expect(strikeState(7)).toEqual({ kind: "warn", left: 1 });
    expect(strikeState(8)).toEqual({ kind: "pause" });
    expect(strikeState(8, { MAGNUS_OFF_TOPIC_PAUSE_AFTER: "0" } as NodeJS.ProcessEnv)).toEqual({ kind: "ok" });
    expect(warningLine(3)).toMatch(/3 more off-topic requests/);
    expect(warningLine(1)).toMatch(/One more off-topic request/);
  });
});
