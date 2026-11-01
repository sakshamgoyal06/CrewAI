import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchUserLists = vi.hoisted(() => vi.fn());
const fetchListBySlug = vi.hoisted(() => vi.fn());
const fetchListItemById = vi.hoisted(() => vi.fn());
const insertList = vi.hoisted(() => vi.fn());
const updateListItem = vi.hoisted(() => vi.fn());
const mirrorArchiveItem = vi.hoisted(() => vi.fn());
const loadUserIntegrations = vi.hoisted(() => vi.fn());

vi.mock("./listStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listStore.js")>();
  return {
    ...actual,
    fetchUserLists,
    fetchListBySlug,
    fetchListItemById,
    insertList,
    updateListItem,
  };
});

vi.mock("./listNotionMirror.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listNotionMirror.js")>();
  return { ...actual, mirrorArchiveItem };
});

vi.mock("../users/userIntegrations.js", () => ({ loadUserIntegrations }));

import { deleteListItem } from "./listService.js";

const tasks = {
  id: "list-1",
  slug: "tasks",
  notion_data_source_id: "db-1",
  archetype: "task_queue",
  notion_title_property: "Title",
  notion_status_property: "Status",
  notion_status_kind: "status" as const,
  default_status: "Queued",
  open_statuses: ["Queued"],
  display_name: "Tasks",
  description: null,
  pillar: null,
  user_profile_id: "u1",
};

describe("deleteListItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadUserIntegrations.mockResolvedValue({});
    insertList.mockResolvedValue({ ok: true, data: tasks });
    fetchUserLists.mockResolvedValue({ ok: true, data: [tasks] });
    fetchListBySlug.mockResolvedValue({ ok: true, data: tasks });
  });

  it("soft-deletes the item and archives Notion when mirrored", async () => {
    fetchListItemById.mockResolvedValue({
      ok: true,
      data: {
        id: "item-1",
        list_id: "list-1",
        title: "Pay bill",
        notion_page_id: "page-1",
      },
    });
    updateListItem.mockResolvedValue({ ok: true, data: {} });
    mirrorArchiveItem.mockResolvedValue(true);

    const out = await deleteListItem({
      userProfileId: "u1",
      list: "tasks",
      itemId: "item-1",
    });

    expect(mirrorArchiveItem).toHaveBeenCalledWith("u1", "page-1");
    expect(updateListItem).toHaveBeenCalledWith("item-1", { isDeleted: true });
    expect(out).toContain('Removed "Pay bill"');
  });
});
