import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/lifeosContext.js", () => ({
  lifeosContextEnabled: vi.fn().mockReturnValue(false),
}));
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
vi.mock("../../tools/clients.js", () => ({
  supabase: { from: vi.fn() },
}));
vi.mock("./semanticMemory.js", () => ({
  loadSemanticFacts: vi.fn().mockResolvedValue(["Prefers morning gym sessions"]),
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
  it("extracts bullets under Not working / watch and Working", () => {
    const body = `## Working
- **Push A** — full routine on time
- **Nutrition** — improving since Jul

## Not working / watch
- **Post-gap treadmill** — 7 min logged
- **Dual load risk** — gym + swim

## Open tweaks
- Something else`;

    expect(parseMarkdownSectionBullets(body, "Not working / watch")).toEqual([
      "Post-gap treadmill — 7 min logged",
      "Dual load risk — gym + swim",
    ]);
    expect(parseMarkdownSectionBullets(body, "Working")).toEqual([
      "Push A — full routine on time",
      "Nutrition — improving since Jul",
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
        body: `## Working
- **Push A return** — discipline reset holding

## Not working / watch
- **Post-gap treadmill** — 7 min logged
- **Dual load risk** — gym + swim`,
      },
    ] as never);

    vi.mocked(getYoutubeState).mockResolvedValue({
      ok: true,
      data: {
        playlist_aliases: {
          magnus: { playlist_id: "PL1", title: "Magnus" },
        },
      },
    } as never);
  });

  it("loads list inventory and user graph without phrase aliases", async () => {
    const layer = await loadUserKnowledgeLayer("user-1");

    expect(layer.lists.map((l) => l.slug)).toEqual(["magnus-ideas", "music"]);
    expect(layer.userGraph.recentIssues[0]?.text).toContain("Post-gap treadmill");
    expect(layer.userGraph.recentWins[0]?.text).toContain("Push A return");
    expect(layer.userGraph.identifiedPatterns.some((p) => p.text.includes("morning gym"))).toBe(
      true,
    );
    expect(layer.integrations.hevy).toBe("connected");
    expect("listAliases" in layer).toBe(false);
  });

  it("formats user graph and list-matching guidance without aliases", () => {
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
        listSamples: [{ slug: "magnus-ideas", titles: ["Item A"] }],
        integrations: {
          notion: "connected",
          googleCalendar: "connected",
          youtube: "connected",
          hevy: "connected",
          zerodha: "token_set",
        },
        playlistAliases: [{ alias: "magnus", title: "Magnus" }],
        userGraph: {
          recentIssues: [{ text: "Post-gap treadmill — 7 min", source: "program_learnings" }],
          recentWins: [{ text: "Push A return", source: "program_learnings" }],
          identifiedPatterns: [{ text: "Skips gym when sleep is poor", source: "semantic_facts" }],
        },
        gaps: [],
      },
      { intent: "GENERAL", rawMessage: "what is in my ideas list?" },
    );

    expect(block).toContain("User graph");
    expect(block).toContain("Recent issues / watch");
    expect(block).toContain("Recent wins");
    expect(block).toContain("Identified patterns");
    expect(block).toContain("magnus-ideas");
    expect(block).toContain("ask which list");
    expect(block).not.toContain("ai task list");
    expect(block).not.toContain("→ music");
  });
});
