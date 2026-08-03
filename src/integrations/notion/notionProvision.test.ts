import { describe, expect, it } from "vitest";

import { STANDARD_LIST_TEMPLATES } from "../../lists/listCatalog.js";
import { notionPropertiesForTemplate } from "./notionProvision.js";

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

  it("uses date for checkins", () => {
    const template = STANDARD_LIST_TEMPLATES.find((t) => t.slug === "checkins")!;
    const props = notionPropertiesForTemplate(template);
    expect(props).toHaveProperty("Date");
    expect((props.Date as { date?: unknown }).date).toBeDefined();
  });
});
