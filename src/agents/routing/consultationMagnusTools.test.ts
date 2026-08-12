import { describe, expect, it } from "vitest";

import { magnusAllowedToolsForConsultation } from "./consultationMagnusTools.js";

describe("magnusAllowedToolsForConsultation", () => {
  it("returns no tools for gym + meal plan only", () => {
    expect(
      magnusAllowedToolsForConsultation(
        "Whats the gym plan for today. And meal plan for today",
      ),
    ).toEqual([]);
  });

  it("includes youtube tools when playlist action is requested", () => {
    const tools = magnusAllowedToolsForConsultation(
      "Add 5 rock songs to my high energy workout playlist",
    );
    expect(tools).toContain("youtube_playlist");
    expect(tools).toContain("youtube_search");
  });

  it("includes list tools for watchlist actions", () => {
    const tools = magnusAllowedToolsForConsultation("Add Rocky to my watchlist");
    expect(tools).toContain("add_list_item");
  });
});
