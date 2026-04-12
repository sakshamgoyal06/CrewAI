import { describe, expect, it } from "vitest";

import { createNotionClient, queryDatabaseByDateProperty } from "./notion.js";

const skipLive =
  process.env.SKIP_NOTION_INTEGRATION === "1" ||
  process.env.SKIP_NOTION_INTEGRATION === "true" ||
  !process.env.NOTION_TOKEN?.trim() ||
  !process.env.NOTION_DAILY_CHECKINS_DATABASE_ID?.trim();

describe.skipIf(skipLive)("Notion integration (optional)", () => {
  it("queries daily check-ins database by date property", async () => {
    const client = createNotionClient();
    expect(client).not.toBeNull();

    const dbId = process.env.NOTION_DAILY_CHECKINS_DATABASE_ID!.trim();
    const prop = process.env.NOTION_CHECKIN_DATE_PROPERTY?.trim() || "Date";
    const dateKey = "2099-01-01";

    const { rawCount } = await queryDatabaseByDateProperty(
      client!,
      dbId,
      prop,
      dateKey,
    );
    expect(typeof rawCount).toBe("number");
  });
});
