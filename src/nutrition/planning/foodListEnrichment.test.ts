import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchListBySlug = vi.fn();
const queryListItems = vi.fn();
const addListItem = vi.fn();

vi.mock("../../lists/listStore.js", () => ({
  fetchListBySlug: (...args: unknown[]) => fetchListBySlug(...args),
  queryListItems: (...args: unknown[]) => queryListItems(...args),
}));

vi.mock("../../lists/listService.js", () => ({
  addListItem: (...args: unknown[]) => addListItem(...args),
}));

import { loadFoodListContext, syncLockedPlanToFoodList } from "./foodListEnrichment.js";

describe("loadFoodListContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty string when food list missing", async () => {
    fetchListBySlug.mockResolvedValue({ ok: false, data: null });
    expect(await loadFoodListContext("u1")).toBe("");
  });

  it("formats open food items for the draft prompt", async () => {
    fetchListBySlug.mockResolvedValue({
      ok: true,
      data: { id: "list-1", open_statuses: ["open"] },
    });
    queryListItems.mockResolvedValue({
      ok: true,
      data: [{ title: "Sushi night" }, { title: "Chipotle bowl" }],
    });

    const ctx = await loadFoodListContext("u1");
    expect(ctx).toContain("Food wishlist");
    expect(ctx).toContain("Sushi night");
    expect(ctx).toContain("Chipotle bowl");
  });
});

describe("syncLockedPlanToFoodList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds novel short titles from locked entries", async () => {
    fetchListBySlug.mockResolvedValue({
      ok: true,
      data: { id: "list-1" },
    });
    queryListItems.mockResolvedValue({ ok: true, data: [] });
    addListItem.mockResolvedValue("Added to food.");

    const result = await syncLockedPlanToFoodList({
      userProfileId: "u1",
      entries: [
        {
          local_date: "2026-08-11",
          meal_slot: "lunch",
          title: "Dal and rice",
          description: null,
        },
      ],
    });

    expect(result.added).toEqual(["Dal and rice"]);
    expect(addListItem).toHaveBeenCalledOnce();
  });

  it("skips titles already on the list", async () => {
    fetchListBySlug.mockResolvedValue({
      ok: true,
      data: { id: "list-1" },
    });
    queryListItems.mockResolvedValue({
      ok: true,
      data: [{ title: "Dal and rice" }],
    });

    const result = await syncLockedPlanToFoodList({
      userProfileId: "u1",
      entries: [
        {
          local_date: "2026-08-11",
          meal_slot: "lunch",
          title: "Dal and rice",
          description: null,
        },
      ],
    });

    expect(result.added).toEqual([]);
    expect(addListItem).not.toHaveBeenCalled();
  });
});
