import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lists/listService.js", () => ({
  ensureUserLists: vi.fn(),
}));
vi.mock("../../lists/listStore.js", () => ({
  queryListItems: vi.fn(),
}));
vi.mock("../../users/userIntegrations.js", () => ({
  loadUserIntegrations: vi.fn(),
}));
vi.mock("../../users/userProgramMemory.js", () => ({
  loadUserProgramMemory: vi.fn(),
}));
vi.mock("../../youtube/youtubeStore.js", () => ({
  getYoutubeState: vi.fn(),
}));

import { ensureUserLists } from "../../lists/listService.js";
import { queryListItems } from "../../lists/listStore.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import { loadUserProgramMemory } from "../../users/userProgramMemory.js";
import { getYoutubeState } from "../../youtube/youtubeStore.js";
import {
  formatUserKnowledgeBlock,
  loadUserKnowledgeLayer,
  parseMarkdownSectionBullets,
} from "./userKnowledge.js";

describe("parseMarkdownSectionBullets", () => {
  it("extracts bullets under Not working / watch", () => {
    const body = `## Working
- Good thing

## Not working / watch
- **Assisted pull-up** — removed from Pull A
- **Finisher when late** — treadmill short

## Open tweaks
- Something else`;

    expect(parseMarkdownSectionBullets(body, "Not working / watch")).toEqual([
      "Assisted pull-up — removed from Pull A",
      "Finisher when late — treadmill short",
    ]);
  });
});

describe("loadUserKnowledgeLayer", () => {
  beforeEach(() => {
    vi.mocked(ensureUserLists).mockResolvedValue([
      {
        id: "l1",
        slug: "magnus-ideas",
        display_name: "Magnus ideas",
        open_statuses: ["Not started", "In progress"],
        notion_data_source_id: "ds1",
        pillar: "wisdom",
      },
      {
        id: "l2",
        slug: "music",
        display_name: "Music list",
        open_statuses: ["Want to Listen"],
        notion_data_source_id: "ds2",
        pillar: "happiness",
      },
    ] as never);

    vi.mocked(queryListItems).mockImplementation(async ({ listId }) => {
      if (listId === "l1") {
        return {
          ok: true,
          data: [
            { title: "Build user knowledge layer", status: "In progress" },
            { title: "Fix morning brief", status: "Not started" },
          ],
        } as never;
      }
      return {
        ok: true,
        data: [{ title: "Guitar practice playlist", status: "Want to Listen" }],
      } as never;
    });

    vi.mocked(loadUserIntegrations).mockResolvedValue({
      notionToken: "tok",
      googleCalendarRefreshToken: "gcal",
      googleYoutubeRefreshToken: "yt",
      hevyApiKey: "hevy",
      kiteApiKey: "kite",
      kiteAccessToken: "access",
    });

    vi.mocked(loadUserProgramMemory).mockResolvedValue([
      {
        section: "program_learnings",
        body: `## Not working / watch
- **Post-gap treadmill** — 7 min logged
- **Dual load risk** — gym + swim`,
      },
      {
        section: "recovery_routine",
        body: "- Max 3 consecutive gym days\n- Default rest after Cardio+Abs",
      },
    ] as never);

    vi.mocked(getYoutubeState).mockResolvedValue({
      ok: true,
      data: {
        playlist_aliases: {
          magnus: { playlist_id: "PL1", title: "Magnus" },
          wisdom: { playlist_id: "PL2", title: "Wisdom" },
        },
      },
    } as never);
  });

  it("loads full list inventory and aliases", async () => {
    const layer = await loadUserKnowledgeLayer("user-1");

    expect(layer.lists.map((l) => l.slug)).toEqual(["magnus-ideas", "music"]);
    expect(layer.listAliases.some((a) => a.phrase === "ai task list" && a.slug === "magnus-ideas")).toBe(
      true,
    );
    expect(layer.listAliases.some((a) => a.phrase === "guitar" && a.slug === "music")).toBe(true);
    expect(layer.listSamples.find((s) => s.slug === "magnus-ideas")?.titles).toContain(
      "Build user knowledge layer",
    );
    expect(layer.integrations.notion).toBe("connected");
    expect(layer.integrations.hevy).toBe("connected");
    expect(layer.healthWatchItems[0]).toContain("Post-gap treadmill");
  });

  it("formats a block that mentions all list slugs", () => {
    const block = formatUserKnowledgeBlock(
      {
        lists: [
          {
            slug: "magnus-ideas",
            displayName: "Magnus ideas",
            totalCount: 9,
            openCount: 2,
            notionLinked: true,
          },
          {
            slug: "music",
            displayName: "Music list",
            totalCount: 1,
            openCount: 1,
            notionLinked: true,
            pillar: "happiness",
          },
        ],
        listAliases: [{ phrase: "ai task list", slug: "magnus-ideas" }],
        listSamples: [{ slug: "magnus-ideas", titles: ["Item A"] }],
        integrations: {
          notion: "connected",
          googleCalendar: "connected",
          youtube: "connected",
          hevy: "connected",
          zerodha: "token_set",
        },
        playlistAliases: [{ alias: "magnus", title: "Magnus" }],
        healthWatchItems: ["Post-gap treadmill — 7 min"],
        healthConstraints: ["Max 3 consecutive gym days"],
        gaps: [],
      },
      { intent: "GENERAL", rawMessage: "what is in my AI task list?" },
    );

    expect(block).toContain("All list slugs for this user");
    expect(block).toContain("magnus-ideas");
    expect(block).toContain("ai task list");
    expect(block).toContain("Hevy: connected");
    expect(block).toContain("Health — active watch");
    expect(block).toContain("list_catalog");
  });
});
