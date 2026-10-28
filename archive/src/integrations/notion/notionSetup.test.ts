import { describe, expect, it } from "vitest";

import { parseNotionId } from "./notionId.js";
import { notionConnectionKind } from "./notionSetup.js";

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

describe("notionConnectionKind", () => {
  it("detects oauth metadata", () => {
    expect(
      notionConnectionKind({
        oauth: { connectedAt: "2026-08-03T00:00:00.000Z" },
        lists: {},
      }),
    ).toBe("oauth");
  });

  it("returns none without oauth metadata", () => {
    expect(notionConnectionKind({ lists: { goals: {} } })).toBe("none");
  });
});
