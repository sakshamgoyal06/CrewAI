import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../lists/listService.js", () => ({
  ensureUserLists: vi.fn(),
}));

vi.mock("../../lists/listStore.js", () => ({
  queryListItems: vi.fn(),
}));

import { ensureUserLists } from "../../lists/listService.js";
import { queryListItems } from "../../lists/listStore.js";
import { loadStaleListSnapshot } from "./listNudgeSignals.js";

describe("loadStaleListSnapshot", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");

  beforeEach(() => {
    vi.mocked(ensureUserLists).mockResolvedValue([
      {
        id: "list-1",
        user_profile_id: "u1",
        slug: "watchlist",
        display_name: "Watchlist",
        archetype: "media_queue",
        description: null,
        pillar: "happiness",
        notion_data_source_id: null,
        notion_title_property: "Title",
        notion_status_property: "Status",
        notion_status_kind: "select",
        default_status: "Want to Watch",
        open_statuses: ["Want to Watch"],
        metadata: {},
        active: true,
        created_at: "",
        updated_at: "",
      },
    ]);
  });

  it("counts items older than staleDays", async () => {
    vi.mocked(queryListItems).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "i1",
          user_profile_id: "u1",
          list_id: "list-1",
          title: "Dune",
          status: "Want to Watch",
          notes: null,
          url: null,
          author: null,
          priority: null,
          extra: {},
          notion_page_id: null,
          completed_at: null,
          is_deleted: false,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "i2",
          user_profile_id: "u1",
          list_id: "list-1",
          title: "Arrival",
          status: "Want to Watch",
          notes: null,
          url: null,
          author: null,
          priority: null,
          extra: {},
          notion_page_id: null,
          completed_at: null,
          is_deleted: false,
          created_at: "2026-08-05T00:00:00.000Z",
          updated_at: "2026-08-05T00:00:00.000Z",
        },
      ],
    });

    const snap = await loadStaleListSnapshot({
      userProfileId: "u1",
      now,
      staleDays: 14,
    });
    expect(snap.totalStale).toBe(1);
    expect(snap.staleItems[0]?.title).toBe("Dune");
  });
});
