import { describe, expect, it } from "vitest";

import { STANDARD_LIST_TEMPLATES } from "../../lists/listCatalog.js";
import { notionPropertiesForTemplate, pickGrantedHubPage } from "./notionProvision.js";

describe("notionPropertiesForTemplate", () => {
  it("uses title + select status for watchlist", () => {
    const template = STANDARD_LIST_TEMPLATES.find((t) => t.slug === "watchlist")!;
    const props = notionPropertiesForTemplate(template);
    expect(props).toHaveProperty("Title");
    expect(props).toHaveProperty("Status");
    expect((props.Status as { select?: unknown }).select).toBeDefined();
  });

  it("uses status property type for tasks", () => {
    const template = STANDARD_LIST_TEMPLATES.find((t) => t.slug === "tasks")!;
    const props = notionPropertiesForTemplate(template);
    expect(props).toHaveProperty("Task name");
    expect((props.Status as { status?: unknown }).status).toBeDefined();
  });

  it("uses title for checkins (date stored as title text)", () => {
    const template = STANDARD_LIST_TEMPLATES.find((t) => t.slug === "checkins")!;
    const props = notionPropertiesForTemplate(template);
    expect(props).toHaveProperty("Date");
    expect((props.Date as { title?: unknown }).title).toBeDefined();
  });
});

describe("pickGrantedHubPage", () => {
  it("prefers a granted page titled Magnus", () => {
    const id = pickGrantedHubPage([
      { id: "a", title: "LifeOS" },
      { id: "b", title: "Magnus" },
    ]);
    expect(id).toBe("b");
  });

  it("returns null when no hub title matches", () => {
    expect(pickGrantedHubPage([{ id: "a", title: "Shopping" }])).toBeNull();
  });
});
