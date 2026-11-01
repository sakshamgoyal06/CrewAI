import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchUserLists = vi.hoisted(() => vi.fn());
const fetchListBySlug = vi.hoisted(() => vi.fn());
const insertList = vi.hoisted(() => vi.fn());
const fetchCheckinItem = vi.hoisted(() => vi.fn());
const insertListItem = vi.hoisted(() => vi.fn());
const updateListItem = vi.hoisted(() => vi.fn());
const mirrorCreateItem = vi.hoisted(() => vi.fn());
const mirrorUpdateItem = vi.hoisted(() => vi.fn());
const logHappinessReserve = vi.hoisted(() => vi.fn());
const upsertPillarStatus = vi.hoisted(() => vi.fn());
const loadUserIntegrations = vi.hoisted(() => vi.fn());

vi.mock("./listStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listStore.js")>();
  return {
    ...actual,
    fetchUserLists,
    fetchListBySlug,
    insertList,
    fetchCheckinItem,
    insertListItem,
    updateListItem,
  };
});

vi.mock("./listNotionMirror.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listNotionMirror.js")>();
  return {
    ...actual,
    mirrorCreateItem,
    mirrorUpdateItem,
  };
});

vi.mock("../lifeos/lifeosStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lifeos/lifeosStore.js")>();
  return {
    ...actual,
    logHappinessReserve,
    upsertPillarStatus,
  };
});

vi.mock("../users/userIntegrations.js", () => ({
  loadUserIntegrations: loadUserIntegrations,
}));

import { logDailyCheckin } from "./listService.js";

describe("logDailyCheckin", () => {
  const list = {
    id: "list-1",
    slug: "checkins",
    archetype: "checkin_log",
    notion_title_property: "Date",
    notion_status_property: null,
    notion_status_kind: "select" as const,
    notion_data_source_id: "db-1",
    default_status: null,
    open_statuses: [],
    display_name: "Daily check-ins",
    description: null,
    pillar: null,
    user_profile_id: "u1",
  };

  const savedItem = {
    id: "item-1",
    title: "2026-08-06",
    extra: { "Health Score": 8 },
    list_id: "list-1",
    user_profile_id: "u1",
    status: null,
    notes: "Gym done — Pull A completed.",
    url: null,
    author: null,
    priority: null,
    notion_page_id: "notion-page-1",
    completed_at: null,
    is_deleted: false,
    created_at: "",
    updated_at: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loadUserIntegrations.mockResolvedValue({});
    fetchUserLists.mockResolvedValue({ ok: true, data: [list] });
    fetchListBySlug.mockResolvedValue({ ok: true, data: list });
    insertList.mockResolvedValue({ ok: true, data: list });
    fetchCheckinItem.mockResolvedValue({ ok: true, data: null });
    mirrorCreateItem.mockResolvedValue("notion-page-1");
    insertListItem.mockResolvedValue({ ok: true, data: savedItem });
    logHappinessReserve.mockResolvedValue({ ok: true, data: { id: "joy-1" } });
    upsertPillarStatus.mockResolvedValue({ ok: true, data: { id: "ps-1" } });
  });

  it("creates a new check-in with notes and LifeOS dual-writes", async () => {
    const result = await logDailyCheckin({
      userProfileId: "u1",
      date: "2026-08-06",
      notes: "Gym done — Pull A completed.",
      joy_score: 80,
      health_score: 8,
    });

    expect(result).toContain("Logged daily check-in for 2026-08-06");
    expect(insertListItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "2026-08-06",
        notes: "Gym done — Pull A completed.",
      }),
    );
    expect(logHappinessReserve).toHaveBeenCalledWith(
      expect.objectContaining({ level: 80, date: "2026-08-06" }),
    );
    expect(upsertPillarStatus).toHaveBeenCalledWith(
      expect.objectContaining({ pillar: "health", score: 8 }),
    );
  });

  it("updates an existing check-in and appends notes", async () => {
    fetchCheckinItem.mockResolvedValue({
      ok: true,
      data: { ...savedItem, notes: "Morning swim.", extra: {} },
    });
    updateListItem.mockResolvedValue({
      ok: true,
      data: { ...savedItem, notes: "Morning swim.\n\nGym done." },
    });

    const result = await logDailyCheckin({
      userProfileId: "u1",
      date: "2026-08-06",
      notes: "Gym done.",
      append_notes: true,
    });

    expect(result).toContain("Logged daily check-in");
    expect(updateListItem).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ notes: "Morning swim.\n\nGym done." }),
    );
    expect(mirrorUpdateItem).toHaveBeenCalled();
  });

  it("rejects empty payloads", async () => {
    const result = await logDailyCheckin({ userProfileId: "u1" });
    expect(result).toContain("Nothing to log");
  });
});
