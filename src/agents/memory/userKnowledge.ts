/**
 * User knowledge layer — a compact per-user graph: lists, integrations, recent issues,
 * wins, and identified patterns. Prepended to the memory block so Magnus can answer from
 * stable pointers without searching chat history or inventing aliases.
 */
import type { Intent } from "../../intent.js";
import { lifeosContextEnabled } from "../../config/lifeosContext.js";
import { ensureUserLists } from "../../lists/listService.js";
import { queryListItems } from "../../lists/listStore.js";
import { supabase } from "../../tools/clients.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import {
  loadUserProgramMemory,
  type ProgramMemorySection,
} from "../../users/userProgramMemory.js";
import { getYoutubeState } from "../../youtube/youtubeStore.js";
import { PILLAR_PLAYLIST_ALIASES } from "../../youtube/playlistResolve.js";
import { loadSemanticFacts } from "./semanticMemory.js";
import type { MemoryContext } from "./types.js";
import { buildIntegrationRegistry } from "../context/integrationRegistry.js";

const MAX_BLOCK_CHARS = 4_200;
const MAX_GRAPH_ITEMS = 8;
const MAX_PATTERN_ITEMS = 6;
const MAX_SAMPLE_ITEMS_PER_LIST = 3;
const SAMPLE_LIST_SLUGS = ["magnus-ideas", "tasks", "goals", "patterns"] as const;

export type UserKnowledgeListEntry = {
  slug: string;
  displayName: string;
  totalCount: number;
  openCount: number;
  notionLinked: boolean;
  pillar?: string;
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

export type UserGraphItem = {
  text: string;
  source: string;
};

export type UserGraph = {
  recentIssues: UserGraphItem[];
  recentWins: UserGraphItem[];
  identifiedPatterns: UserGraphItem[];
  /** One-line rolling context when available. */
  rollingContext?: string;
};

export type UserKnowledgeLayer = {
  lists: UserKnowledgeListEntry[];
  listSamples: UserKnowledgeListSample[];
  integrations: UserKnowledgeIntegrations;
  playlistAliases: UserKnowledgePlaylistAlias[];
  userGraph: UserGraph;
  gaps: string[];
  activeProjectsBlock?: string;
};

export type LoadUserKnowledgeOptions = {
  intent?: Intent;
  rawMessage?: string;
  /** Reuse data already loaded for memory when available. */
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

function programSectionBody(
  rows: Array<{ section: ProgramMemorySection; body: string }>,
  section: ProgramMemorySection,
): string {
  return rows.find((r) => r.section === section)?.body ?? "";
}

function toGraphItems(lines: string[], source: string, max: number): UserGraphItem[] {
  return lines.slice(-max).map((text) => ({ text, source }));
}

function patternRowToText(row: Record<string, unknown>): string | null {
  const label =
    (typeof row.title === "string" && row.title.trim()) ||
    (typeof row.name === "string" && row.name.trim()) ||
    (typeof row.pattern === "string" && row.pattern.trim()) ||
    (typeof row.description === "string" && row.description.trim().slice(0, 120)) ||
    "";
  if (!label) {
    return null;
  }
  const stage =
    (typeof row.stage === "string" && row.stage) ||
    (typeof row.confidence === "string" && row.confidence) ||
    (typeof row.status === "string" && row.status) ||
    "";
  return stage ? `${label} [${stage}]` : label;
}

async function loadDbPatterns(userProfileId: string): Promise<UserGraphItem[]> {
  if (!lifeosContextEnabled()) {
    return [];
  }
  const { data, error } = await supabase
    .from("patterns")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(MAX_PATTERN_ITEMS);

  if (error || !data?.length) {
    return [];
  }

  return data
    .map((row) => patternRowToText(row as Record<string, unknown>))
    .filter((t): t is string => Boolean(t))
    .map((text) => ({ text, source: "patterns" }));
}

async function loadPatternsListItems(userProfileId: string): Promise<UserGraphItem[]> {
  const lists = await ensureUserLists(userProfileId);
  const patternsList = lists.find((l) => l.slug === "patterns");
  if (!patternsList) {
    return [];
  }
  const items = await queryListItems({
    userProfileId,
    listId: patternsList.id,
    openStatuses:
      patternsList.open_statuses.length > 0 ? patternsList.open_statuses : undefined,
    limit: MAX_PATTERN_ITEMS,
  });
  if (!items.ok) {
    return [];
  }
  return items.data.map((item) => ({
    text: item.status ? `${item.title} [${item.status}]` : item.title,
    source: "patterns_list",
  }));
}

function loadProgramGraph(
  programRows: Array<{ section: ProgramMemorySection; body: string }>,
): Pick<UserGraph, "recentIssues" | "recentWins"> {
  const learnings = programSectionBody(programRows, "program_learnings");

  const recentIssues = toGraphItems(
    parseMarkdownSectionBullets(learnings, "Not working / watch"),
    "program_learnings",
    MAX_GRAPH_ITEMS,
  );

  const recentWins = toGraphItems(
    parseMarkdownSectionBullets(learnings, "Working"),
    "program_learnings",
    MAX_GRAPH_ITEMS,
  );

  return { recentIssues, recentWins };
}

async function loadUserGraph(
  userProfileId: string,
  programRows: Array<{ section: ProgramMemorySection; body: string }>,
  memory?: MemoryContext,
): Promise<UserGraph> {
  const { recentIssues, recentWins } = loadProgramGraph(programRows);

  const identifiedPatterns: UserGraphItem[] = [];

  if (memory?.patterns?.length) {
    for (const row of memory.patterns.slice(0, MAX_PATTERN_ITEMS)) {
      const text = patternRowToText(row);
      if (text) {
        identifiedPatterns.push({ text, source: "patterns" });
      }
    }
  } else {
    identifiedPatterns.push(...(await loadDbPatterns(userProfileId)));
  }

  const listPatternItems = await loadPatternsListItems(userProfileId);
  for (const item of listPatternItems) {
    if (
      identifiedPatterns.length < MAX_PATTERN_ITEMS &&
      !identifiedPatterns.some((p) => p.text === item.text)
    ) {
      identifiedPatterns.push(item);
    }
  }

  const semanticFacts = await loadSemanticFacts(userProfileId, 6);
  for (const fact of semanticFacts) {
    if (identifiedPatterns.length >= MAX_PATTERN_ITEMS) {
      break;
    }
    if (!identifiedPatterns.some((p) => p.text === fact)) {
      identifiedPatterns.push({ text: fact, source: "semantic_facts" });
    }
  }

  const rollingContext =
    memory?.rollingSummaries?.summary7d?.trim() ||
    memory?.rollingSummaries?.summary30d?.trim() ||
    undefined;

  return {
    recentIssues,
    recentWins,
    identifiedPatterns: identifiedPatterns.slice(0, MAX_PATTERN_ITEMS),
    rollingContext: rollingContext ? truncate(rollingContext, 400) : undefined,
  };
}

async function loadListKnowledge(
  userProfileId: string,
  memory?: MemoryContext,
): Promise<{
  lists: UserKnowledgeListEntry[];
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

    entries.push({
      slug: list.slug,
      displayName: list.display_name,
      totalCount: allRows.length,
      openCount: openRows.length,
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

  if (memory?.lists?.catalog) {
    for (const entry of entries) {
      const fromMem = memory.lists.catalog.find((c) => c.slug === entry.slug);
      if (fromMem?.displayName) {
        entry.displayName = fromMem.displayName;
      }
    }
  }

  if (entries.length === 0) {
    gaps.push("lists: no lists provisioned");
  }

  return { lists: entries, listSamples: samples, gaps };
}

function loadIntegrationKnowledge(
  integrations: Awaited<ReturnType<typeof loadUserIntegrations>>,
): UserKnowledgeIntegrations {
  return buildIntegrationRegistry(integrations);
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

  const userGraph = await loadUserGraph(userProfileId, programRows, options.memory);

  gaps.push(...listKnowledge.gaps);

  let activeProjectsBlock: string | undefined;
  try {
    const { buildActiveProjectSummaries, formatProjectsMemoryBlock } = await import(
      "../../projects/projectExecutor.js"
    );
    const summaries = await buildActiveProjectSummaries(userProfileId);
    const block = formatProjectsMemoryBlock(summaries);
    if (block.trim()) {
      activeProjectsBlock = block;
    }
  } catch {
    /* projects module optional until migration applied */
  }

  return {
    lists: listKnowledge.lists,
    listSamples: listKnowledge.listSamples,
    integrations: loadIntegrationKnowledge(integrations),
    playlistAliases,
    userGraph,
    gaps,
    activeProjectsBlock,
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

function formatGraphSection(title: string, items: UserGraphItem[]): string | null {
  if (items.length === 0) {
    return null;
  }
  const lines = items.map((item) => `- ${truncate(item.text, 160)}`);
  return `${title}:\n${lines.join("\n")}`;
}

function messageMentionsList(msg: string): boolean {
  return /\b(?:list|watchlist|readlist|notion|tasks?|todo|ideas?)\b/i.test(msg);
}

/**
 * Format the knowledge layer for injection ahead of the standard memory block.
 */
export function formatUserKnowledgeBlock(
  layer: UserKnowledgeLayer,
  options: { intent?: Intent; rawMessage?: string } = {},
): string {
  const parts: string[] = [
    "User graph (compact context — prefer this over searching chat history):",
  ];

  const issues = formatGraphSection("Recent issues / watch", layer.userGraph.recentIssues);
  const wins = formatGraphSection("Recent wins", layer.userGraph.recentWins);
  const patterns = formatGraphSection("Identified patterns & standing facts", layer.userGraph.identifiedPatterns);

  if (issues) {
    parts.push(issues);
  }
  if (wins) {
    parts.push(wins);
  }
  if (patterns) {
    parts.push(patterns);
  }
  if (layer.activeProjectsBlock?.trim()) {
    parts.push(layer.activeProjectsBlock.trim());
  }
  if (layer.userGraph.rollingContext) {
    parts.push(`Rolling context (7–30d): ${layer.userGraph.rollingContext}`);
  }

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
    parts.push(`Your lists (match by meaning on slug + display name):\n${lines.join("\n")}`);
  }

  const emphasizeLists =
    options.intent === "GENERAL" ||
    options.intent === "WISDOM" ||
    options.intent === "HAPPINESS" ||
    (options.rawMessage && messageMentionsList(options.rawMessage));

  if (emphasizeLists && layer.listSamples.length > 0) {
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

  parts.push(
    "List resolution: infer which list the user means from slug and display name. If nothing clearly matches, show the list catalog above and ask which list they mean — do not invent aliases or new lists.",
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
