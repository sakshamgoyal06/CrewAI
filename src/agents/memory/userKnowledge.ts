/**
 * User knowledge layer — stable pointers about this user's setup, lists, integrations,
 * and active health watch items. Prepended to the memory block so Magnus does not claim
 * a list or integration does not exist when it already does.
 */
import type { Intent } from "../../intent.js";
import { ensureUserLists } from "../../lists/listService.js";
import { queryListItems } from "../../lists/listStore.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import {
  loadUserProgramMemory,
  type ProgramMemorySection,
} from "../../users/userProgramMemory.js";
import { getYoutubeState } from "../../youtube/youtubeStore.js";
import { PILLAR_PLAYLIST_ALIASES } from "../../youtube/playlistResolve.js";
import type { MemoryContext } from "./types.js";

const MAX_BLOCK_CHARS = 3_800;
const MAX_WATCH_ITEMS = 10;
const MAX_SAMPLE_ITEMS_PER_LIST = 4;
const SAMPLE_LIST_SLUGS = ["magnus-ideas", "tasks", "goals"] as const;

/** Phrases users say → canonical list slug (only emitted when slug exists for user). */
const PHRASE_LIST_ALIASES: ReadonlyArray<{ phrases: string[]; slug: string }> = [
  {
    phrases: ["ai task list", "ai tasks", "ai plan", "magnus ideas", "magnus-ideas", "ideas list"],
    slug: "magnus-ideas",
  },
  {
    phrases: ["guitar", "guitar list", "guitar practice", "music/guitar"],
    slug: "music",
  },
  {
    phrases: ["life tasks", "todo list", "to-do list", "to do list"],
    slug: "tasks",
  },
  {
    phrases: ["reading list", "books to read"],
    slug: "readlist",
  },
  {
    phrases: ["movies to watch", "film list"],
    slug: "watchlist",
  },
];

export type UserKnowledgeListEntry = {
  slug: string;
  displayName: string;
  totalCount: number;
  openCount: number;
  notionLinked: boolean;
  pillar?: string;
};

export type UserKnowledgeListAlias = {
  phrase: string;
  slug: string;
};

export type UserKnowledgeListSample = {
  slug: string;
  titles: string[];
};

export type UserKnowledgeIntegrations = {
  notion: "connected" | "not_connected";
  googleCalendar: "connected" | "not_connected";
  youtube: "connected" | "not_connected";
  hevy: "connected" | "not_connected";
  zerodha: "connected" | "not_connected" | "token_set";
};

export type UserKnowledgePlaylistAlias = {
  alias: string;
  title?: string;
};

export type UserKnowledgeLayer = {
  lists: UserKnowledgeListEntry[];
  listAliases: UserKnowledgeListAlias[];
  listSamples: UserKnowledgeListSample[];
  integrations: UserKnowledgeIntegrations;
  playlistAliases: UserKnowledgePlaylistAlias[];
  healthWatchItems: string[];
  healthConstraints: string[];
  gaps: string[];
};

export type LoadUserKnowledgeOptions = {
  intent?: Intent;
  rawMessage?: string;
  /** Reuse list catalog from memory load when available. */
  memory?: MemoryContext;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

/** Extract bullet lines under a `## heading` in markdown program memory. */
export function parseMarkdownSectionBullets(body: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = body.match(re);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) =>
      line
        .replace(/^-\s*/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function extractConstraintBullets(body: string, max: number): string[] {
  if (!body.trim()) {
    return [];
  }
  const bullets = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-") || line.startsWith("*"))
    .map((line) =>
      line
        .replace(/^[-*]\s*/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .trim(),
    )
    .filter(Boolean);
  if (bullets.length > 0) {
    return bullets.slice(0, max);
  }
  return [truncate(body.replace(/\s+/g, " ").trim(), 200)];
}

function programSectionBody(
  rows: Array<{ section: ProgramMemorySection; body: string }>,
  section: ProgramMemorySection,
): string {
  return rows.find((r) => r.section === section)?.body ?? "";
}

function buildListAliases(existingSlugs: Set<string>): UserKnowledgeListAlias[] {
  const out: UserKnowledgeListAlias[] = [];
  for (const { phrases, slug } of PHRASE_LIST_ALIASES) {
    if (!existingSlugs.has(slug)) {
      continue;
    }
    for (const phrase of phrases) {
      out.push({ phrase, slug });
    }
  }
  return out;
}

async function loadListKnowledge(
  userProfileId: string,
  memory?: MemoryContext,
): Promise<{
  lists: UserKnowledgeListEntry[];
  listAliases: UserKnowledgeListAlias[];
  listSamples: UserKnowledgeListSample[];
  gaps: string[];
}> {
  const gaps: string[] = [];
  const lists = await ensureUserLists(userProfileId);

  const entries: UserKnowledgeListEntry[] = [];
  const samples: UserKnowledgeListSample[] = [];

  for (const list of lists) {
    const items = await queryListItems({
      userProfileId,
      listId: list.id,
      limit: 50,
    });

    const openStatuses = new Set(list.open_statuses);
    const allRows = items.ok ? items.data : [];
    const openRows =
      openStatuses.size > 0
        ? allRows.filter((i) => i.status != null && openStatuses.has(i.status))
        : allRows;
    const totalCount = allRows.length;
    const openCount = openRows.length;

    entries.push({
      slug: list.slug,
      displayName: list.display_name,
      totalCount,
      openCount,
      notionLinked: Boolean(list.notion_data_source_id),
      pillar: list.pillar ?? undefined,
    });

    const shouldSample =
      (SAMPLE_LIST_SLUGS as readonly string[]).includes(list.slug) ||
      list.slug.includes("idea") ||
      list.slug.includes("task");

    if (shouldSample && openRows.length > 0) {
      samples.push({
        slug: list.slug,
        titles: openRows.slice(0, MAX_SAMPLE_ITEMS_PER_LIST).map((i) => i.title),
      });
    }
  }

  // If memory already loaded catalog, merge display names (no-op if same)
  if (memory?.lists?.catalog) {
    for (const entry of entries) {
      const fromMem = memory.lists.catalog.find((c) => c.slug === entry.slug);
      if (fromMem?.displayName) {
        entry.displayName = fromMem.displayName;
      }
    }
  }

  const slugSet = new Set(entries.map((e) => e.slug));
  const listAliases = buildListAliases(slugSet);

  if (entries.length === 0) {
    gaps.push("lists: no lists provisioned");
  }

  return { lists: entries, listAliases, listSamples: samples, gaps };
}

function loadIntegrationKnowledge(integrations: Awaited<ReturnType<typeof loadUserIntegrations>>): UserKnowledgeIntegrations {
  return {
    notion: integrations.notionToken ? "connected" : "not_connected",
    googleCalendar: integrations.googleCalendarRefreshToken ? "connected" : "not_connected",
    youtube: integrations.googleYoutubeRefreshToken ? "connected" : "not_connected",
    hevy: integrations.hevyApiKey ? "connected" : "not_connected",
    zerodha:
      integrations.kiteAccessToken && integrations.kiteApiKey
        ? "token_set"
        : integrations.kiteApiKey
          ? "connected"
          : "not_connected",
  };
}

async function loadPlaylistAliasKnowledge(
  userProfileId: string,
): Promise<UserKnowledgePlaylistAlias[]> {
  const state = await getYoutubeState(userProfileId);
  if (!state.ok || !state.data) {
    return PILLAR_PLAYLIST_ALIASES.map((alias) => ({ alias }));
  }

  const aliases = state.data.playlist_aliases ?? {};
  const out: UserKnowledgePlaylistAlias[] = [];
  const seen = new Set<string>();

  for (const alias of PILLAR_PLAYLIST_ALIASES) {
    const entry = aliases[alias];
    out.push({ alias, title: entry?.title });
    seen.add(alias);
  }

  for (const [alias, entry] of Object.entries(aliases)) {
    if (seen.has(alias)) {
      continue;
    }
    out.push({ alias, title: entry.title });
  }

  return out;
}

function loadHealthKnowledge(
  programRows: Array<{ section: ProgramMemorySection; body: string }>,
): { healthWatchItems: string[]; healthConstraints: string[] } {
  const learnings = programSectionBody(programRows, "program_learnings");
  const userContext = programSectionBody(programRows, "user_context");
  const recovery = programSectionBody(programRows, "recovery_routine");

  const healthWatchItems = parseMarkdownSectionBullets(
    learnings,
    "Not working / watch",
  ).slice(0, MAX_WATCH_ITEMS);

  const healthConstraints: string[] = [];
  healthConstraints.push(...extractConstraintBullets(userContext, 3));
  for (const line of extractConstraintBullets(recovery, 3)) {
    if (!healthConstraints.includes(line)) {
      healthConstraints.push(line);
    }
  }

  return {
    healthWatchItems,
    healthConstraints: healthConstraints.slice(0, 6),
  };
}

export async function loadUserKnowledgeLayer(
  userProfileId: string,
  options: LoadUserKnowledgeOptions = {},
): Promise<UserKnowledgeLayer> {
  const gaps: string[] = [];

  const [integrations, programRows, listKnowledge, playlistAliases] = await Promise.all([
    loadUserIntegrations(userProfileId),
    loadUserProgramMemory(userProfileId),
    loadListKnowledge(userProfileId, options.memory),
    loadPlaylistAliasKnowledge(userProfileId),
  ]);

  gaps.push(...listKnowledge.gaps);

  const { healthWatchItems, healthConstraints } = loadHealthKnowledge(programRows);

  return {
    lists: listKnowledge.lists,
    listAliases: listKnowledge.listAliases,
    listSamples: listKnowledge.listSamples,
    integrations: loadIntegrationKnowledge(integrations),
    playlistAliases,
    healthWatchItems,
    healthConstraints,
    gaps,
  };
}

function formatIntegrations(integrations: UserKnowledgeIntegrations): string {
  const lines = [
    `- Notion: ${integrations.notion}`,
    `- Google Calendar: ${integrations.googleCalendar}`,
    `- YouTube / YT Music: ${integrations.youtube}`,
    `- Hevy: ${integrations.hevy}`,
    `- Zerodha Kite: ${
      integrations.zerodha === "token_set"
        ? "connected (token set; expires daily ~6 AM IST — say connect Zerodha to refresh)"
        : integrations.zerodha
    }`,
  ];
  return `Connected integrations:\n${lines.join("\n")}`;
}

function messageMentionsList(msg: string): boolean {
  return /\b(?:list|watchlist|readlist|notion|tasks?|todo|ideas?|magnus.?ideas|guitar|music list)\b/i.test(
    msg,
  );
}

function messageMentionsHealth(msg: string): boolean {
  return /\b(?:hevy|gym|workout|training|health|recovery|sleep|nutrition|meal|injury|pain|sore)\b/i.test(
    msg,
  );
}

/**
 * Format the knowledge layer for injection ahead of the standard memory block.
 */
export function formatUserKnowledgeBlock(
  layer: UserKnowledgeLayer,
  options: { intent?: Intent; rawMessage?: string } = {},
): string {
  const parts: string[] = [
    "User knowledge (stable pointers — check before saying a list, integration, or watch item does not exist):",
  ];

  if (layer.lists.length > 0) {
    const lines = layer.lists.map((l) => {
      const notion = l.notionLinked ? ", notion linked" : "";
      const counts =
        l.openCount > 0
          ? `${l.openCount} open / ${l.totalCount} shown`
          : `${l.totalCount} items (none open)`;
      const pillar = l.pillar ? `, ${l.pillar}` : "";
      return `- ${l.slug} ("${l.displayName}"): ${counts}${notion}${pillar}`;
    });
    parts.push(`All list slugs for this user:\n${lines.join("\n")}`);
  }

  if (layer.listAliases.length > 0) {
    const bySlug = new Map<string, string[]>();
    for (const { phrase, slug } of layer.listAliases) {
      const arr = bySlug.get(slug) ?? [];
      arr.push(`"${phrase}"`);
      bySlug.set(slug, arr);
    }
    const aliasLines = [...bySlug.entries()].map(
      ([slug, phrases]) => `- ${phrases.join(" / ")} → ${slug}`,
    );
    parts.push(`List phrase aliases:\n${aliasLines.join("\n")}`);
  }

  if (layer.listSamples.length > 0) {
    const sampleLines = layer.listSamples.map(
      (s) => `- ${s.slug}: ${s.titles.map((t) => `"${truncate(t, 60)}"`).join("; ")}`,
    );
    parts.push(
      `Sample open list items (call list_items for full rows — do not invent):\n${sampleLines.join("\n")}`,
    );
  }

  parts.push(formatIntegrations(layer.integrations));

  if (layer.playlistAliases.length > 0) {
    const plLines = layer.playlistAliases
      .slice(0, 12)
      .map((p) => (p.title ? `- ${p.alias} → "${p.title}"` : `- ${p.alias} (pillar alias)`));
    parts.push(`YouTube playlist aliases:\n${plLines.join("\n")}`);
  }

  const emphasizeHealth =
    options.intent === "HEALTH" ||
    options.intent === "GENERAL" ||
    (options.rawMessage && messageMentionsHealth(options.rawMessage));

  if (emphasizeHealth && layer.healthWatchItems.length > 0) {
    const watchLines = layer.healthWatchItems.map((w) => `- ${truncate(w, 140)}`);
    parts.push(`Health — active watch / not-working items (from program memory):\n${watchLines.join("\n")}`);
  }

  if (emphasizeHealth && layer.healthConstraints.length > 0) {
    const constraintLines = layer.healthConstraints.map((c) => `- ${truncate(c, 120)}`);
    parts.push(`Health — constraints / recovery rules:\n${constraintLines.join("\n")}`);
  }

  const emphasizeLists =
    options.intent === "GENERAL" ||
    options.intent === "WISDOM" ||
    options.intent === "HAPPINESS" ||
    (options.rawMessage && messageMentionsList(options.rawMessage));

  if (!emphasizeLists && layer.lists.length > 8) {
    // On non-list turns, still keep slug inventory but drop samples to save tokens.
    const withoutSamples = parts.filter((p) => !p.startsWith("Sample open list items"));
    parts.length = 0;
    parts.push(...withoutSamples);
  }

  parts.push(
    "Before denying a list exists or recommending from scratch, use list_catalog / list_items with the slug above.",
  );

  const out = parts.join("\n\n");
  return out.length > MAX_BLOCK_CHARS ? `${out.slice(0, MAX_BLOCK_CHARS)}…` : out;
}

export function userKnowledgeEnabled(): boolean {
  const raw = process.env.MAGNUS_MEMORY_USER_KNOWLEDGE?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return true;
}
