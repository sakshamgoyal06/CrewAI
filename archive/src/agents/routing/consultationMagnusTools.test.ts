import { describe, expect, it } from "vitest";

import { magnusAllowedToolsForConsultation } from "./consultationMagnusTools.js";

describe("magnusAllowedToolsForConsultation", () => {
  it("returns no tools when parser lists no capabilities", () => {
    expect(magnusAllowedToolsForConsultation([])).toEqual([]);
  });

  it("includes youtube tools when parser lists youtube capability", () => {
    const tools = magnusAllowedToolsForConsultation(["youtube"]);
    expect(tools).toContain("youtube_playlist");
    expect(tools).toContain("youtube_search");
  });

  it("includes list tools when parser lists lists capability", () => {
    const tools = magnusAllowedToolsForConsultation(["lists"]);
    expect(tools).toContain("add_list_item");
  });

  it("includes calendar tools when parser lists calendar capability", () => {
    const tools = magnusAllowedToolsForConsultation(["calendar"]);
    expect(tools).toContain("read_calendar");
    expect(tools).toContain("delete_calendar_event");
  });
});
