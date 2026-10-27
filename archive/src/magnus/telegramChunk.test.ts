import { describe, expect, it } from "vitest";

import {
  splitPlainForTelegram,
  TELEGRAM_MAX_MESSAGE_CHARS,
  TELEGRAM_SAFE_PLAIN_CHUNK,
} from "./telegramChunk.js";

describe("splitPlainForTelegram", () => {
  it("returns a single chunk when under limit", () => {
    expect(splitPlainForTelegram("short")).toEqual(["short"]);
  });

  it("splits oversized content into chunks at most TELEGRAM_SAFE_PLAIN_CHUNK", () => {
    const long = "a".repeat(TELEGRAM_SAFE_PLAIN_CHUNK + 100);
    const chunks = splitPlainForTelegram(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= TELEGRAM_SAFE_PLAIN_CHUNK)).toBe(true);
  });

  it("respects TELEGRAM_MAX_MESSAGE_CHARS when custom max passed", () => {
    const long = "b".repeat(TELEGRAM_MAX_MESSAGE_CHARS + 50);
    const chunks = splitPlainForTelegram(long, TELEGRAM_MAX_MESSAGE_CHARS);
    expect(chunks.every((c) => c.length <= TELEGRAM_MAX_MESSAGE_CHARS)).toBe(true);
  });
});
