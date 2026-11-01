import { describe, expect, it, vi } from "vitest";

import { recommendListItems } from "./listService.js";

vi.mock("../users/userIntegrations.js", () => ({
  loadUserIntegrations: vi.fn(async () => ({})),
}));

vi.mock("./listStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listStore.js")>();
  return {
    ...actual,
    fetchUserLists: vi.fn(async () => ({
      ok: true,
      data: [
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
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      ],
    })),
    fetchListBySlug: vi.fn(async () => ({
      ok: true,
      data: {
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
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    })),
    queryListItems: vi.fn(async () => ({
      ok: true,
      data: [
        {
          id: "i1",
          user_profile_id: "u1",
          list_id: "list-1",
          title: "Short Thriller Night",
          status: "Want to Watch",
          notes: null,
          url: null,
          author: null,
          priority: null,
          extra: { genre: "thriller", rating: 5, runtime_minutes: 95 },
          notion_page_id: null,
          completed_at: null,
          is_deleted: false,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
        {
          id: "i2",
          user_profile_id: "u1",
          list_id: "list-1",
          title: "Epic Drama",
          status: "Want to Watch",
          notes: null,
          url: null,
          author: null,
          priority: null,
          extra: { genre: "drama", rating: 4, runtime_minutes: 180 },
          notion_page_id: null,
          completed_at: null,
          is_deleted: false,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      ],
    })),
    insertList: vi.fn(async () => ({ ok: true, data: { id: "list-new" } })),
  };
});

describe("recommendListItems", () => {
  it("filters by genre, rating, and runtime", async () => {
    const out = await recommendListItems({
      userProfileId: "u1",
      list: "watchlist",
      genre: "thriller",
      minRating: 4,
      maxRuntimeMinutes: 120,
    });
    expect(out).toContain("Short Thriller Night");
    expect(out).not.toContain("Epic Drama");
  });
});
