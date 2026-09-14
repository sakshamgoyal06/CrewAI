import { describe, expect, it } from "vitest";

import { formatSyncSummary } from "./notionListSync.js";
import { parseNotionListPage } from "../../lists/listNotionMirror.js";
import type { ListRow } from "../../lists/listStore.js";

describe("formatSyncSummary", () => {
  it("summarizes push/pull counts", () => {
    const text = formatSyncSummary({
      listsCreated: ["tasks"],
      schemaPatched: ["watchlist"],
      pushedToNotion: 3,
      updatedInNotion: 2,
      pulledFromNotion: 1,
      skipped: [],
      errors: [],
    });
    expect(text).toContain("Pushed to Notion: 3");
    expect(text).toContain("Pulled from Notion: 1");
    expect(text).toContain("tasks");
  });
});

describe("parseNotionListPage", () => {
  const tasksList = {
    slug: "tasks",
    archetype: "task_queue",
    notion_title_property: "Task name",
    notion_status_property: "Status",
    default_status: "Not started",
  } as ListRow;

  it("reads title and status from a Notion row", () => {
    const parsed = parseNotionListPage(tasksList, {
      "Task name": {
        type: "title",
        title: [{ plain_text: "Buy milk" }],
      },
      Status: {
        type: "status",
        status: { name: "In progress" },
      },
    });
    expect(parsed?.title).toBe("Buy milk");
    expect(parsed?.status).toBe("In progress");
  });
});
