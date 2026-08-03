import { describe, expect, it } from "vitest";

import { parseNotionId } from "./notionId.js";

describe("parseNotionId", () => {
  it("parses dashed UUID", () => {
    expect(parseNotionId("32cb455a-f233-811b-9e29-fcd84f710759")).toBe(
      "32cb455a-f233-811b-9e29-fcd84f710759",
    );
  });

  it("parses Notion URL", () => {
    expect(parseNotionId("https://www.notion.so/LifeOS-32cb455af233811b9e29fcd84f710759")).toBe(
      "32cb455a-f233-811b-9e29-fcd84f710759",
    );
  });

  it("returns null for garbage", () => {
    expect(parseNotionId("not a url")).toBeNull();
  });
});
