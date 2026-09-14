import { describe, expect, it } from "vitest";

import { isStandardSlug, STANDARD_LIST_TEMPLATES } from "./listCatalog.js";
import { isValidCustomSlug, matchListByName, normalizeSlug } from "./listSlug.js";

describe("listSlug", () => {
  it("maps common aliases to standard slugs", () => {
    expect(normalizeSlug("watchlist")).toBe("watchlist");
    expect(normalizeSlug("read")).toBe("readlist");
    expect(normalizeSlug("todo")).toBe("tasks");
    expect(normalizeSlug("song")).toBe("music");
    expect(normalizeSlug("check-in")).toBe("checkins");
  });

  it("accepts custom slugs", () => {
    expect(normalizeSlug("gift-ideas")).toBe("gift-ideas");
    expect(isValidCustomSlug("gift-ideas")).toBe(true);
  });

  it("rejects input that cannot become a slug", () => {
    expect(normalizeSlug("")).toBeNull();
    expect(normalizeSlug("!!!")).toBeNull();
    expect(normalizeSlug("a".repeat(60))).toBeNull();
  });

  it("turns a human-typed name into a usable slug instead of refusing it", () => {
    expect(normalizeSlug("Gift Ideas!")).toBe("gift-ideas");
    expect(normalizeSlug("Bad Slug!")).toBe("bad-slug");
  });

  // The phrasing a person actually uses is the phrasing that used to fail.
  it("resolves the way people say list names out loud", () => {
    expect(normalizeSlug("todo list")).toBe("tasks");
    expect(normalizeSlug("my todo list")).toBe("tasks");
    expect(normalizeSlug("to-do list")).toBe("tasks");
    expect(normalizeSlug("the task list")).toBe("tasks");
    expect(normalizeSlug("reading list")).toBe("readlist");
    expect(normalizeSlug("watch list")).toBe("watchlist");
    expect(normalizeSlug("my books list")).toBe("readlist");
    expect(normalizeSlug("movies")).toBe("watchlist");
    expect(normalizeSlug("goals list")).toBe("goals");
  });

  it("keeps custom names custom rather than forcing them onto a standard list", () => {
    expect(normalizeSlug("shopping list")).toBe("shopping");
    expect(normalizeSlug("my grocery list")).toBe("grocery");
    expect(normalizeSlug("holiday prep")).toBe("holiday-prep");
  });

  it("does not strip the only word it has", () => {
    expect(normalizeSlug("list")).toBe("list");
    expect(normalizeSlug("my")).toBe("my");
  });
});

describe("matchListByName", () => {
  const lists = [
    { slug: "tasks", display_name: "Tasks" },
    { slug: "groceries", display_name: "Grocery Run" },
    { slug: "holiday-prep", display_name: "Holiday Prep" },
    { slug: "watchlist", display_name: "Watchlist" },
  ];

  it("finds a list the user named in words that are not its slug", () => {
    expect(matchListByName(lists, "grocery")?.slug).toBe("groceries");
    expect(matchListByName(lists, "my grocery list")?.slug).toBe("groceries");
    expect(matchListByName(lists, "Holiday Prep")?.slug).toBe("holiday-prep");
    expect(matchListByName(lists, "holiday prep list")?.slug).toBe("holiday-prep");
  });

  it("prefers an exact match over a prefix match", () => {
    const withBoth = [...lists, { slug: "task-archive", display_name: "Task Archive" }];
    expect(matchListByName(withBoth, "tasks")?.slug).toBe("tasks");
  });

  it("returns null rather than guessing at an unrelated name", () => {
    expect(matchListByName(lists, "quarterly board deck")).toBeNull();
    expect(matchListByName(lists, "")).toBeNull();
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
