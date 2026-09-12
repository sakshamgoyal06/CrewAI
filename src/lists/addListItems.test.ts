import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchUserLists = vi.hoisted(() => vi.fn());
const fetchListBySlug = vi.hoisted(() => vi.fn());
const insertList = vi.hoisted(() => vi.fn());
const insertListItem = vi.hoisted(() => vi.fn());
const queryListItems = vi.hoisted(() => vi.fn());
const mirrorCreateItem = vi.hoisted(() => vi.fn());
const loadUserIntegrations = vi.hoisted(() => vi.fn());

vi.mock("./listStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listStore.js")>();
  return {
    ...actual,
    fetchUserLists,
    fetchListBySlug,
    insertList,
    insertListItem,
    queryListItems,
  };
});

vi.mock("./listNotionMirror.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listNotionMirror.js")>();
  return { ...actual, mirrorCreateItem };
});

vi.mock("../users/userIntegrations.js", () => ({ loadUserIntegrations }));

import { addListItems } from "./listService.js";

const tasks = {
  id: "list-tasks",
  slug: "tasks",
  archetype: "task_queue",
  notion_title_property: "Title",
  notion_status_property: "Status",
  notion_status_kind: "status" as const,
  notion_data_source_id: null,
  default_status: "Queued",
  open_statuses: ["Queued", "In progress"],
  display_name: "Tasks",
  description: null,
  pillar: null,
  user_profile_id: "u1",
};

function item(title: string, extra: Record<string, unknown> = {}) {
  return {
    id: `item-${title.toLowerCase().replace(/\W+/g, "-")}`,
    title,
    list_id: tasks.id,
    user_profile_id: "u1",
    status: "Queued",
    notes: null,
    url: null,
    author: null,
    priority: null,
    extra: {},
    notion_page_id: null,
    completed_at: null,
    is_deleted: false,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

describe("addListItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadUserIntegrations.mockResolvedValue({});
    fetchUserLists.mockResolvedValue({ ok: true, data: [tasks] });
    fetchListBySlug.mockResolvedValue({ ok: true, data: tasks });
    insertList.mockResolvedValue({ ok: true, data: tasks });
    queryListItems.mockResolvedValue({ ok: true, data: [] });
    mirrorCreateItem.mockResolvedValue(null);
    insertListItem.mockImplementation(async (input: { title: string }) => ({
      ok: true,
      data: item(input.title),
    }));
  });

  // The real failure: a 13-item holiday list needed 13 calls against a 12-round budget.
  it("saves a whole list in one call", async () => {
    const titles = Array.from({ length: 13 }, (_, i) => `Task ${i + 1}`);
    const out = await addListItems({
      userProfileId: "u1",
      list: "todo list",
      items: titles.map((title) => ({ title })),
    });

    expect(insertListItem).toHaveBeenCalledTimes(13);
    expect(out).toContain("Added 13 to tasks");
    expect(out).toContain('"Task 1"');
    expect(out).toContain('"Task 13"');
  });

  it("applies shared status and priority to every item", async () => {
    await addListItems({
      userProfileId: "u1",
      list: "tasks",
      items: [{ title: "Pack bags" }, { title: "Book cab", priority: "Low" }],
      priority: "High",
      status: "In progress",
    });

    expect(insertListItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ title: "Pack bags", priority: "High", status: "In progress" }),
    );
    expect(insertListItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ title: "Book cab", priority: "Low" }),
    );
  });

  it("leaves items that are already open on the list alone", async () => {
    queryListItems.mockResolvedValue({ ok: true, data: [item("Pack bags")] });

    const out = await addListItems({
      userProfileId: "u1",
      list: "tasks",
      items: [{ title: "Pack bags" }, { title: "Book cab" }],
    });

    expect(insertListItem).toHaveBeenCalledTimes(1);
    expect(insertListItem).toHaveBeenCalledWith(expect.objectContaining({ title: "Book cab" }));
    expect(out).toContain("Added 1 to tasks");
    expect(out).toContain("Already on tasks, left alone");
    expect(out).toContain('"Pack bags"');
  });

  it("collapses duplicate titles inside one request", async () => {
    const out = await addListItems({
      userProfileId: "u1",
      list: "tasks",
      items: [{ title: "Book cab" }, { title: "book cab" }, { title: "  " }],
    });

    expect(insertListItem).toHaveBeenCalledTimes(1);
    expect(out).toContain("Added 1 to tasks");
  });

  // A partial failure that reads as success is how a 13-item list gets silently lost.
  it("names exactly which items failed instead of reporting a clean save", async () => {
    insertListItem.mockImplementation(async (input: { title: string }) =>
      input.title === "Book cab"
        ? { ok: false, error: "duplicate key value violates unique constraint" }
        : { ok: true, data: item(input.title) },
    );

    const out = await addListItems({
      userProfileId: "u1",
      list: "tasks",
      items: [{ title: "Pack bags" }, { title: "Book cab" }],
    });

    expect(out).toContain("Added 1 to tasks");
    expect(out).toContain("Could not save 1 to tasks");
    expect(out).toContain('"Book cab"');
    expect(out).toContain("duplicate key value");
  });

  it("reports an unknown list rather than dropping the items", async () => {
    fetchListBySlug.mockResolvedValue({ ok: true, data: null });
    fetchUserLists.mockResolvedValue({ ok: true, data: [] });

    const out = await addListItems({
      userProfileId: "u1",
      list: "quarterly board deck",
      items: [{ title: "Pack bags" }],
    });

    expect(insertListItem).not.toHaveBeenCalled();
    expect(out).toContain('Unknown list "quarterly board deck"');
  });

  it("says so when every title was empty", async () => {
    const out = await addListItems({
      userProfileId: "u1",
      list: "tasks",
      items: [{ title: "" }, { title: "   " }],
    });

    expect(insertListItem).not.toHaveBeenCalled();
    expect(out).toBe("No items to add — every title was empty.");
  });

  // Slug resolution has to survive the way the user actually names the list.
  it("finds a list the user named by display name", async () => {
    const groceries = { ...tasks, id: "list-groceries", slug: "groceries", display_name: "Grocery Run" };
    fetchUserLists.mockResolvedValue({ ok: true, data: [tasks, groceries] });
    fetchListBySlug.mockResolvedValue({ ok: true, data: null });

    const out = await addListItems({
      userProfileId: "u1",
      list: "my grocery list",
      items: [{ title: "Coriander" }],
    });

    expect(insertListItem).toHaveBeenCalledWith(
      expect.objectContaining({ listId: "list-groceries" }),
    );
    expect(out).toContain("Added 1 to groceries");
  });
});
