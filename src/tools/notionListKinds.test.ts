import { describe, expect, it } from "vitest";

import { normalizeSlug } from "../lists/listSlug.js";

describe("normalizeListKind (via listSlug)", () => {
  it("maps common aliases", () => {
    expect(normalizeSlug("watchlist")).toBe("watchlist");
    expect(normalizeSlug("read")).toBe("readlist");
    expect(normalizeSlug("todo")).toBe("tasks");
    expect(normalizeSlug("song")).toBe("music");
  });

  it("returns null for unknown lists", () => {
    expect(normalizeSlug("!!!")).toBeNull();
  });
});
