import { describe, expect, it } from "vitest";

import { checkReadBeforeWrite } from "./readBeforeWrite.js";

describe("checkReadBeforeWrite", () => {
  it("blocks calendar update without read_calendar", () => {
    const out = checkReadBeforeWrite("update_calendar_event", []);
    expect(out.blocked).toBe(true);
    if (out.blocked) {
      expect(out.message).toContain("read_calendar");
    }
  });

  it("blocks calendar delete without read_calendar", () => {
    expect(checkReadBeforeWrite("delete_calendar_event", []).blocked).toBe(true);
  });

  it("allows calendar update after read_calendar", () => {
    expect(
      checkReadBeforeWrite("update_calendar_event", ["read_calendar"]).blocked,
    ).toBe(false);
  });

  it("allows calendar update after read_tool_artifact spill follow-up", () => {
    expect(
      checkReadBeforeWrite("delete_calendar_event", [
        "read_calendar",
        "read_tool_artifact",
      ]).blocked,
    ).toBe(false);
  });

  it("allows create_calendar_event without prior read", () => {
    expect(checkReadBeforeWrite("create_calendar_event", []).blocked).toBe(false);
  });

  it("blocks list update without list read", () => {
    expect(checkReadBeforeWrite("update_list_item", []).blocked).toBe(true);
  });

  it("allows list update after list_items", () => {
    expect(checkReadBeforeWrite("update_list_item", ["list_items"]).blocked).toBe(false);
  });

  it("allows add_list_item without prior read", () => {
    expect(checkReadBeforeWrite("add_list_item", []).blocked).toBe(false);
  });
});
