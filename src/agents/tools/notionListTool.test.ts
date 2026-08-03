import { describe, expect, it } from "vitest";

import { normalizeListKind } from "../../tools/notionRegistry.js";

describe("normalizeListKind", () => {
  it("maps common aliases", () => {
    expect(normalizeListKind("watchlist")).toBe("watchlist");
    expect(normalizeListKind("read")).toBe("readlist");
    expect(normalizeListKind("todo")).toBe("tasks");
    expect(normalizeListKind("song")).toBe("music");
  });

  it("returns null for unknown lists", () => {
    expect(normalizeListKind("shopping")).toBeNull();
  });
});
