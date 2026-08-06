import { describe, expect, it } from "vitest";

import { isStandardSlug, STANDARD_LIST_TEMPLATES } from "./listCatalog.js";
import { isValidCustomSlug, normalizeSlug } from "./listSlug.js";

describe("listSlug", () => {
  it("maps common aliases to standard slugs", () => {
    expect(normalizeSlug("watchlist")).toBe("watchlist");
    expect(normalizeSlug("read")).toBe("readlist");
    expect(normalizeSlug("todo")).toBe("tasks");
    expect(normalizeSlug("song")).toBe("music");
    expect(normalizeSlug("check-in")).toBe("checkins");
    expect(normalizeSlug("magnus ideas")).toBe("magnus-ideas");
    expect(normalizeSlug("guitar")).toBe("music");
  });

  it("accepts custom slugs", () => {
    expect(normalizeSlug("gift-ideas")).toBe("gift-ideas");
    expect(isValidCustomSlug("gift-ideas")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(normalizeSlug("")).toBeNull();
    expect(normalizeSlug("Bad Slug!")).toBeNull();
    expect(normalizeSlug("a".repeat(60))).toBeNull();
  });
});

describe("listCatalog", () => {
  it("ships standard templates for every life list type", () => {
    const slugs = STANDARD_LIST_TEMPLATES.map((t) => t.slug);
    expect(slugs).toContain("watchlist");
    expect(slugs).toContain("readlist");
    expect(slugs).toContain("travel");
    expect(slugs).toContain("food");
    expect(slugs).toContain("music");
    expect(slugs).toContain("tasks");
    expect(slugs).toContain("goals");
    expect(slugs).toContain("patterns");
    expect(slugs).toContain("experiences");
    expect(slugs).toContain("checkins");
    expect(isStandardSlug("watchlist")).toBe(true);
    expect(isStandardSlug("custom-thing")).toBe(false);
  });
});
