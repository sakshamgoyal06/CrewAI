/**
 * User-agnostic list orchestration: Supabase canonical, optional Notion mirror per list.
 */
import { loadUserIntegrations } from "../users/userIntegrations.js";
import {
  createLifeosGoal,
  logHappinessReserve,
  upsertPillarStatus,
} from "../lifeos/lifeosStore.js";
import type { NotionListConfig, NotionRegistry } from "../tools/notionRegistry.js";
import { getStandardTemplate, STANDARD_LIST_TEMPLATES, type ListArchetype } from "./listCatalog.js";
import {
  fetchCheckinFromNotion,
  formatCheckinReply,
  formatItemLine,
  mirrorArchiveItem,
  mirrorCreateItem,
  mirrorUpdateItem,
} from "./listNotionMirror.js";
import {
  describeUnknownList,
  isValidCustomSlug,
  matchListByName,
  normalizeSlug,
} from "./listSlug.js";
import {
  fetchCheckinItem,
  fetchListBySlug,
  fetchListItemById,
  fetchUserLists,
  insertList,
  insertListItem,
  queryListItems,
  updateList,
  updateListItem,
  type ListRow,
} from "./listStore.js";

async function syncRegistryIntoLists(userProfileId: string): Promise<void> {
  const integrations = await loadUserIntegrations(userProfileId);
  const registry = integrations.notionRegistry as NotionRegistry | undefined;
  if (!registry?.lists) {
    return;
  }

  const lists = await fetchUserLists(userProfileId);
  if (!lists.ok) {
    return;
  }

  for (const [slug, cfg] of Object.entries(registry.lists)) {
    if (!cfg?.dataSourceId) {
      continue;
    }
    const existing = lists.data.find((l) => l.slug === slug);
    if (!existing) {
      continue;
    }
    if (
      existing.notion_data_source_id === cfg.dataSourceId &&
      existing.notion_title_property === (cfg.titleProperty ?? existing.notion_title_property)
    ) {
      continue;
    }
    await updateList(existing.id, {
      notionDataSourceId: cfg.dataSourceId,
      notionTitleProperty: cfg.titleProperty ?? existing.notion_title_property,
      notionStatusProperty: cfg.statusProperty ?? existing.notion_status_property,
      notionStatusKind: slug === "tasks" ? "status" : "select",
      defaultStatus: cfg.defaultStatus ?? existing.default_status,
      openStatuses: cfg.openStatuses ?? existing.open_statuses,
    });
  }

  // Legacy single-column ids
  if (integrations.notionGoalsDatabaseId) {
    const goals = lists.data.find((l) => l.slug === "goals");
    if (goals && !goals.notion_data_source_id) {
      await updateList(goals.id, { notionDataSourceId: integrations.notionGoalsDatabaseId });
    }
  }
  if (integrations.notionDailyCheckinsDatabaseId) {
    const checkins = lists.data.find((l) => l.slug === "checkins");
    if (checkins && !checkins.notion_data_source_id) {
      await updateList(checkins.id, {
        notionDataSourceId: integrations.notionDailyCheckinsDatabaseId,
      });
    }
  }
}

export async function ensureUserLists(userProfileId: string): Promise<ListRow[]> {
  const existing = await fetchUserLists(userProfileId);
  if (!existing.ok) {
    throw new Error(existing.error);
  }

  const have = new Set(existing.data.map((l) => l.slug));
  for (const template of STANDARD_LIST_TEMPLATES) {
    if (have.has(template.slug)) {
      continue;
    }
    const inserted = await insertList({
      userProfileId,
      slug: template.slug,
      displayName: template.displayName,
      archetype: template.archetype,
      description: template.description,
      pillar: template.pillar,
      notionTitleProperty: template.notionTitleProperty,
      notionStatusProperty: template.notionStatusProperty,
      notionStatusKind: template.notionStatusKind,
      defaultStatus: template.defaultStatus,
      openStatuses: template.openStatuses,
    });
    if (!inserted.ok) {
      throw new Error(inserted.error);
    }
  }

  await syncRegistryIntoLists(userProfileId);

  const refreshed = await fetchUserLists(userProfileId);
  if (!refreshed.ok) {
    throw new Error(refreshed.error);
  }
  return refreshed.data;
}

async function resolveList(userProfileId: string, rawList: string): Promise<ListRow | null> {
  const slug = normalizeSlug(rawList);
  if (!slug) {
    return null;
  }
  const lists = await ensureUserLists(userProfileId);
  const row = await fetchListBySlug(userProfileId, slug);
  if (!row.ok) {
    throw new Error(row.error);
  }
  if (row.data) {
    return row.data;
  }
  // The user named a list they own in words that do not spell its slug.
  return matchListByName(lists, rawList);
}

export async function listCatalog(userProfileId: string): Promise<string> {
  const lists = await ensureUserLists(userProfileId);
  if (lists.length === 0) {
    return "No lists yet.";
  }

  const lines = lists.map((l) => {
    const mirror = l.notion_data_source_id ? "notion linked" : "supabase only";
    return `${l.slug} — ${l.display_name} (${l.archetype}, ${mirror})`;
  });
  return `Your lists (${lists.length}):\n${lines.join("\n")}`;
}

export async function listItems(input: {
  userProfileId: string;
  list: string;
  status?: string;
  openOnly?: boolean;
  limit?: number;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  const items = await queryListItems({
    userProfileId: input.userProfileId,
    listId: list.id,
    status: input.status,
    openStatuses: input.openOnly ? list.open_statuses : undefined,
    limit: input.limit,
  });
  if (!items.ok) {
    return `Could not read ${list.slug}: ${items.error}`;
  }

  if (items.data.length === 0) {
    return `No items in ${list.slug}${input.openOnly ? " (open)" : ""}.`;
  }

  const lines = items.data.map((item) => formatItemLine(item));
  return `${list.slug} (${items.data.length}):\n${lines.join("\n")}`;
}

/** Find when a list item was added — used for "when did I add X to watchlist" asks. */
export async function lookupListItemAddedAt(input: {
  userProfileId: string;
  list: string;
  titleQuery: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  const q = input.titleQuery.trim().toLowerCase();
  if (!q) {
    return "Need a title to look up when an item was added.";
  }

  const items = await queryListItems({
    userProfileId: input.userProfileId,
    listId: list.id,
    limit: 50,
  });
  if (!items.ok) {
    return `Could not read ${list.slug}: ${items.error}`;
  }

  const matches = items.data.filter((item) => item.title.toLowerCase().includes(q));
  if (matches.length === 0) {
    return `No item matching "${input.titleQuery.trim()}" in ${list.slug}.`;
  }
  if (matches.length > 1) {
    const lines = matches.slice(0, 5).map((item) => formatItemLine(item));
    return `Multiple matches in ${list.slug} — be more specific:\n${lines.join("\n")}`;
  }

  const item = matches[0]!;
  const added = item.created_at.slice(0, 10);
  return `"${item.title}" was added to ${list.slug} on ${added} (id:${item.id}).`;
}

function extraNumber(extra: Record<string, unknown>, key: string): number | undefined {
  const v = extra[key];
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function extraString(extra: Record<string, unknown>, key: string): string | undefined {
  const v = extra[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function matchesGenre(extra: Record<string, unknown>, genre: string): boolean {
  const g = genre.trim().toLowerCase();
  const single = extraString(extra, "genre")?.toLowerCase();
  if (single && single.includes(g)) {
    return true;
  }
  const genres = extra.genres;
  if (Array.isArray(genres)) {
    return genres.some((x) => typeof x === "string" && x.toLowerCase().includes(g));
  }
  return false;
}

/** Structured list recommendations — filters `extra` JSONB fields client-side. */
export async function recommendListItems(input: {
  userProfileId: string;
  list: string;
  genre?: string;
  language?: string;
  minRating?: number;
  maxRuntimeMinutes?: number;
  openOnly?: boolean;
  query?: string;
  limit?: number;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  const items = await queryListItems({
    userProfileId: input.userProfileId,
    listId: list.id,
    openStatuses: input.openOnly !== false ? list.open_statuses : undefined,
    limit: Math.min(input.limit ?? 48, 80),
  });
  if (!items.ok) {
    return `Could not read ${list.slug}: ${items.error}`;
  }

  const q = input.query?.trim().toLowerCase();
  const lang = input.language?.trim().toLowerCase();
  const minRating = input.minRating;
  const maxRuntime = input.maxRuntimeMinutes;

  const matched = items.data.filter((item) => {
    const extra = item.extra ?? {};
    if (q) {
      const hay = `${item.title} ${item.notes ?? ""} ${item.author ?? ""}`.toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }
    if (input.genre?.trim() && !matchesGenre(extra, input.genre)) {
      return false;
    }
    if (lang) {
      const itemLang = extraString(extra, "language")?.toLowerCase();
      if (itemLang && !itemLang.includes(lang)) {
        return false;
      }
    }
    if (minRating !== undefined) {
      const rating = extraNumber(extra, "rating");
      if (rating === undefined || rating < minRating) {
        return false;
      }
    }
    if (maxRuntime !== undefined) {
      const runtime = extraNumber(extra, "runtime_minutes");
      if (runtime !== undefined && runtime > maxRuntime) {
        return false;
      }
    }
    return true;
  });

  const cap = Math.min(input.limit ?? 8, 20);
  const picks = matched.slice(0, cap);

  if (picks.length === 0) {
    return `No matches in ${list.slug} for those filters. Try list_items to browse, or add_list_item with genre/rating in notes.`;
  }

  const lines = picks.map((item) => {
    const extra = item.extra ?? {};
    const bits = [formatItemLine(item)];
    const rating = extraNumber(extra, "rating");
    const runtime = extraNumber(extra, "runtime_minutes");
    const genre = extraString(extra, "genre");
    const why: string[] = [];
    if (genre) {
      why.push(`genre: ${genre}`);
    }
    if (rating !== undefined) {
      why.push(`rating: ${rating}`);
    }
    if (runtime !== undefined) {
      why.push(`${runtime}m`);
    }
    if (why.length > 0) {
      bits.push(`(${why.join(", ")})`);
    }
    return bits.join(" ");
  });

  return `Recommendations from ${list.slug} (${picks.length} of ${matched.length} matches):\n${lines.join("\n")}`;
}

type NewListItem = {
  title: string;
  status?: string;
  notes?: string;
  url?: string;
  author?: string;
  priority?: string;
  pillar?: string;
};

function normalizePriority(value: string | undefined): "High" | "Medium" | "Low" | undefined {
  return value === "High" || value === "Medium" || value === "Low" ? value : undefined;
}

async function saveOneItem(
  userProfileId: string,
  list: ListRow,
  item: NewListItem,
): Promise<{ ok: true; id: string; mirrored: boolean } | { ok: false; error: string }> {
  const status = item.status ?? list.default_status ?? undefined;
  const extra: Record<string, unknown> = {};
  if (item.pillar) {
    extra.pillar = item.pillar;
  }

  const notionPageId = await mirrorCreateItem(userProfileId, list, {
    title: item.title,
    status,
    notes: item.notes,
    url: item.url,
    author: item.author,
    priority: item.priority,
    extra,
  });

  const saved = await insertListItem({
    userProfileId,
    listId: list.id,
    title: item.title,
    status,
    notes: item.notes,
    url: item.url,
    author: item.author,
    priority: normalizePriority(item.priority),
    extra,
    notionPageId: notionPageId ?? undefined,
  });

  if (!saved.ok) {
    return { ok: false, error: saved.error };
  }
  return { ok: true, id: saved.data.id, mirrored: Boolean(notionPageId) };
}

export async function addListItem(input: {
  userProfileId: string;
  list: string;
  title: string;
  status?: string;
  notes?: string;
  url?: string;
  author?: string;
  priority?: string;
  pillar?: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  const title = input.title.trim();
  if (!title) {
    return "Title is required.";
  }

  const saved = await saveOneItem(input.userProfileId, list, { ...input, title });
  if (!saved.ok) {
    return `Could not save to ${list.slug}: ${saved.error}`;
  }

  const mirrorNote = saved.mirrored ? " (mirrored to Notion)" : "";
  return `Added to ${list.slug}: "${title}" id:${saved.id}${mirrorNote}.`;
}

/**
 * Add a whole list in one call. Asking for "a todo list for the trip" is one request,
 * not thirteen, and one call per item burns the tool-round budget before the list is
 * saved. Reports per-item outcomes so a partial failure cannot be read as success.
 */
export async function addListItems(input: {
  userProfileId: string;
  list: string;
  items: NewListItem[];
  status?: string;
  priority?: string;
  pillar?: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  const cleaned: NewListItem[] = [];
  const seen = new Set<string>();
  for (const raw of input.items) {
    const title = raw.title?.trim();
    if (!title) {
      continue;
    }
    const key = title.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    cleaned.push({
      ...raw,
      title,
      status: raw.status ?? input.status,
      priority: raw.priority ?? input.priority,
      pillar: raw.pillar ?? input.pillar,
    });
  }

  if (cleaned.length === 0) {
    return "No items to add — every title was empty.";
  }

  const existing = await queryListItems({
    userProfileId: input.userProfileId,
    listId: list.id,
    openStatuses: list.open_statuses,
    limit: 200,
  });
  const alreadyOpen = new Set(
    existing.ok ? existing.data.map((row) => row.title.trim().toLowerCase()) : [],
  );

  const added: string[] = [];
  const skipped: string[] = [];
  const failed: { title: string; error: string }[] = [];

  for (const item of cleaned) {
    if (alreadyOpen.has(item.title.toLowerCase())) {
      skipped.push(item.title);
      continue;
    }
    const saved = await saveOneItem(input.userProfileId, list, item);
    if (saved.ok) {
      added.push(`"${item.title}" id:${saved.id}`);
    } else {
      failed.push({ title: item.title, error: saved.error });
    }
  }

  const parts: string[] = [];
  if (added.length > 0) {
    parts.push(`Added ${added.length} to ${list.slug}: ${added.join(", ")}.`);
  }
  if (skipped.length > 0) {
    parts.push(`Already on ${list.slug}, left alone: ${skipped.map((t) => `"${t}"`).join(", ")}.`);
  }
  if (failed.length > 0) {
    const detail = failed.map((f) => `"${f.title}" (${f.error})`).join(", ");
    parts.push(`Could not save ${failed.length} to ${list.slug}: ${detail}.`);
  }
  return parts.join(" ");
}

export async function deleteListItem(input: {
  userProfileId: string;
  list: string;
  itemId: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  const existing = await fetchListItemById(input.userProfileId, input.itemId.trim());
  if (!existing.ok) {
    return existing.error;
  }
  if (!existing.data || existing.data.list_id !== list.id) {
    return `Item ${input.itemId} not found in ${list.slug}.`;
  }

  if (existing.data.notion_page_id) {
    await mirrorArchiveItem(input.userProfileId, existing.data.notion_page_id);
  }

  const removed = await updateListItem(input.itemId.trim(), { isDeleted: true });
  if (!removed.ok) {
    return removed.error;
  }

  return `Removed "${existing.data.title}" from ${list.slug}.`;
}

export async function updateListItemById(input: {
  userProfileId: string;
  list: string;
  itemId: string;
  status?: string;
  notes?: string;
  title?: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  const existing = await fetchListItemById(input.userProfileId, input.itemId.trim());
  if (!existing.ok) {
    return existing.error;
  }
  if (!existing.data || existing.data.list_id !== list.id) {
    return `Item ${input.itemId} not found in ${list.slug}.`;
  }

  if (!input.status && !input.notes && !input.title?.trim()) {
    return "Nothing to update — provide status, notes, or title.";
  }

  if (existing.data.notion_page_id) {
    await mirrorUpdateItem(input.userProfileId, list, existing.data.notion_page_id, {
      title: input.title,
      status: input.status,
      notes: input.notes,
    });
  }

  const updated = await updateListItem(input.itemId.trim(), {
    title: input.title?.trim() || undefined,
    status: input.status,
    notes: input.notes,
  });
  if (!updated.ok) {
    return updated.error;
  }

  return `Updated ${list.slug} item ${input.itemId}.`;
}

/** Accepts Supabase item id or legacy Notion page id. */
export async function updateListItemCompat(input: {
  userProfileId: string;
  list: string;
  itemId: string;
  status?: string;
  notes?: string;
  title?: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, input.list);
  if (!list) {
    return describeUnknownList(input.list);
  }

  let itemId = input.itemId.trim();
  const byId = await fetchListItemById(input.userProfileId, itemId);
  if (byId.ok && byId.data) {
    return updateListItemById({ ...input, itemId: byId.data.id });
  }

  // Legacy Notion page id path
  const items = await queryListItems({
    userProfileId: input.userProfileId,
    listId: list.id,
    limit: 50,
  });
  if (items.ok) {
    const match = items.data.find((i) => i.notion_page_id === itemId);
    if (match) {
      return updateListItemById({ ...input, itemId: match.id });
    }
  }

  if (list.notion_data_source_id) {
    await mirrorUpdateItem(input.userProfileId, list, itemId, {
      title: input.title,
      status: input.status,
      notes: input.notes,
    });
    return `Updated ${list.slug} Notion item ${itemId}.`;
  }

  return `Item ${itemId} not found in ${list.slug}. Use id from list_items results.`;
}

export async function createCustomList(input: {
  userProfileId: string;
  slug: string;
  displayName: string;
  archetype?: ListArchetype;
  description?: string;
  pillar?: string;
}): Promise<string> {
  const slug = normalizeSlug(input.slug);
  if (!slug || !isValidCustomSlug(slug)) {
    return "Invalid slug — use lowercase letters, numbers, hyphens (e.g. shopping, gift-ideas).";
  }

  if (getStandardTemplate(slug)) {
    await ensureUserLists(input.userProfileId);
    return `List "${slug}" is a standard list — already available. Use list_items to read it.`;
  }

  await ensureUserLists(input.userProfileId);
  const existing = await fetchListBySlug(input.userProfileId, slug);
  if (existing.ok && existing.data) {
    return `List "${slug}" already exists (${existing.data.display_name}).`;
  }

  const inserted = await insertList({
    userProfileId: input.userProfileId,
    slug,
    displayName: input.displayName.trim() || slug,
    archetype: input.archetype ?? "generic_queue",
    description: input.description,
    pillar: input.pillar,
    defaultStatus: "Open",
    openStatuses: ["Open", "In progress"],
  });

  if (!inserted.ok) {
    return `Could not create list: ${inserted.error}`;
  }

  const { provisionNotionDatabaseForCustomList } = await import(
    "../integrations/notion/notionProvision.js"
  );
  const notionDbId = await provisionNotionDatabaseForCustomList({
    userProfileId: input.userProfileId,
    slug,
    displayName: inserted.data.display_name,
  });

  const notionNote = notionDbId
    ? " Notion database created under your Magnus space."
    : "";

  return `Created list "${slug}" (${inserted.data.display_name}). Add items with add_list_item.${notionNote}`;
}

export async function linkNotionList(input: {
  userProfileId: string;
  slug: string;
  notionDatabaseId: string;
  titleProperty?: string;
  statusProperty?: string;
  statusKind?: "select" | "status";
}): Promise<string> {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    return describeUnknownList(input.slug);
  }

  const list = await resolveList(input.userProfileId, slug);
  if (!list) {
    return describeUnknownList(input.slug);
  }

  const updated = await updateList(list.id, {
    notionDataSourceId: input.notionDatabaseId.trim(),
    notionTitleProperty: input.titleProperty ?? list.notion_title_property,
    notionStatusProperty: input.statusProperty ?? list.notion_status_property,
    notionStatusKind: input.statusKind ?? list.notion_status_kind,
  });

  if (!updated.ok) {
    return updated.error;
  }

  return `Linked Notion database to ${slug}. New items will mirror there when Notion is connected.`;
}

export async function getDailyCheckin(input: {
  userProfileId: string;
  date?: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, "checkins");
  if (!list) {
    return "Check-ins list is not available.";
  }

  const dateKey = input.date?.trim() || new Date().toISOString().slice(0, 10);

  let item = await fetchCheckinItem(input.userProfileId, list.id, dateKey);
  if (!item.ok) {
    return item.error;
  }

  if (!item.data) {
    const fromNotion = await fetchCheckinFromNotion(input.userProfileId, list, dateKey);
    if (fromNotion) {
      const saved = await insertListItem({
        userProfileId: input.userProfileId,
        listId: list.id,
        title: fromNotion.title,
        extra: fromNotion.extra,
        notionPageId: fromNotion.notionPageId,
      });
      if (saved.ok) {
        return formatCheckinReply(dateKey, saved.data);
      }
    }
    return `No check-in for ${dateKey}.`;
  }

  return formatCheckinReply(dateKey, item.data);
}

const CHECKIN_EXTRA_KEYS = {
  day_rating: "Day Rating",
  health_score: "Health Score",
  wealth_score: "Wealth Score",
  wisdom_score: "Wisdom Score",
  joy_score: "Joy Score",
  feeling: "How Are You Feeling",
  pattern_flags: "Pattern Flags",
  morning_intention: "Morning Intention",
  energy_level: "Energy Level",
  week_priorities: "Week Priorities",
  weekly_win: "Weekly Win",
  weekly_slip: "Weekly Slip",
} as const;

function buildCheckinExtra(input: {
  day_rating?: string | number;
  health_score?: number;
  wealth_score?: number;
  wisdom_score?: number;
  joy_score?: number;
  feeling?: string;
  pattern_flags?: string;
  morning_intention?: string;
  energy_level?: number;
  week_priorities?: string;
  weekly_win?: string;
  weekly_slip?: string;
}): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (input.day_rating != null && String(input.day_rating).trim()) {
    extra[CHECKIN_EXTRA_KEYS.day_rating] = String(input.day_rating).trim();
  }
  if (input.health_score != null) {
    extra[CHECKIN_EXTRA_KEYS.health_score] = input.health_score;
  }
  if (input.wealth_score != null) {
    extra[CHECKIN_EXTRA_KEYS.wealth_score] = input.wealth_score;
  }
  if (input.wisdom_score != null) {
    extra[CHECKIN_EXTRA_KEYS.wisdom_score] = input.wisdom_score;
  }
  if (input.joy_score != null) {
    extra[CHECKIN_EXTRA_KEYS.joy_score] = input.joy_score;
  }
  if (input.feeling?.trim()) {
    extra[CHECKIN_EXTRA_KEYS.feeling] = input.feeling.trim();
  }
  if (input.pattern_flags?.trim()) {
    extra[CHECKIN_EXTRA_KEYS.pattern_flags] = input.pattern_flags.trim();
  }
  if (input.morning_intention?.trim()) {
    extra[CHECKIN_EXTRA_KEYS.morning_intention] = input.morning_intention.trim();
  }
  if (input.energy_level != null && Number.isFinite(input.energy_level)) {
    extra[CHECKIN_EXTRA_KEYS.energy_level] = input.energy_level;
  }
  if (input.week_priorities?.trim()) {
    extra[CHECKIN_EXTRA_KEYS.week_priorities] = input.week_priorities.trim();
  }
  if (input.weekly_win?.trim()) {
    extra[CHECKIN_EXTRA_KEYS.weekly_win] = input.weekly_win.trim();
  }
  if (input.weekly_slip?.trim()) {
    extra[CHECKIN_EXTRA_KEYS.weekly_slip] = input.weekly_slip.trim();
  }
  return extra;
}

function mergeCheckinExtra(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...patch };
}

async function syncCheckinLifeosWriters(input: {
  userProfileId: string;
  dateKey: string;
  notes?: string;
  joy_score?: number;
  health_score?: number;
  wealth_score?: number;
  wisdom_score?: number;
  health_status?: string;
  wealth_status?: string;
  wisdom_status?: string;
  joy_status?: string;
}): Promise<string[]> {
  const lines: string[] = [];

  if (input.joy_score != null) {
    const joy = await logHappinessReserve({
      userProfileId: input.userProfileId,
      date: input.dateKey,
      level: input.joy_score,
      notes: input.notes,
      selfReportedState: undefined,
    });
    if (joy.ok) {
      lines.push(`Joy tank ${input.joy_score}/100 saved.`);
    } else {
      lines.push(`Joy tank: ${joy.error}`);
    }
  }

  const pillarWrites: Array<{
    pillar: string;
    score?: number;
    status?: string;
  }> = [
    { pillar: "health", score: input.health_score, status: input.health_status },
    { pillar: "wealth", score: input.wealth_score, status: input.wealth_status },
    { pillar: "learning", score: input.wisdom_score, status: input.wisdom_status },
  ];

  for (const row of pillarWrites) {
    if (row.score == null && !row.status?.trim()) {
      continue;
    }
    const status = row.status?.trim() || "on_track";
    const result = await upsertPillarStatus({
      userProfileId: input.userProfileId,
      pillar: row.pillar,
      date: input.dateKey,
      status,
      score: row.score,
      summary: input.notes?.trim() || undefined,
    });
    if (result.ok) {
      const scoreBit = row.score != null ? ` (score ${row.score})` : "";
      lines.push(`${row.pillar} pillar ${status}${scoreBit} saved.`);
    } else {
      lines.push(`${row.pillar} pillar: ${result.error}`);
    }
  }

  return lines;
}

/** Upsert today's (or dated) daily check-in — list row + optional LifeOS dual-writes. */
export async function logDailyCheckin(input: {
  userProfileId: string;
  date?: string;
  notes?: string;
  append_notes?: boolean;
  day_rating?: string | number;
  health_score?: number;
  wealth_score?: number;
  wisdom_score?: number;
  joy_score?: number;
  feeling?: string;
  pattern_flags?: string;
  morning_intention?: string;
  energy_level?: number;
  week_priorities?: string;
  weekly_win?: string;
  weekly_slip?: string;
  health_status?: string;
  wealth_status?: string;
  wisdom_status?: string;
}): Promise<string> {
  const list = await resolveList(input.userProfileId, "checkins");
  if (!list) {
    return "Check-ins list is not available.";
  }

  const dateKey = input.date?.trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return "date must be YYYY-MM-DD.";
  }

  const notes = input.notes?.trim();
  const patchExtra = buildCheckinExtra(input);
  const hasContent =
    Boolean(notes) ||
    Object.keys(patchExtra).length > 0 ||
    input.health_status?.trim() ||
    input.wealth_status?.trim() ||
    input.wisdom_status?.trim();

  if (!hasContent) {
    return "Nothing to log — provide notes, pillar scores, intention, or a day rating.";
  }

  const existing = await fetchCheckinItem(input.userProfileId, list.id, dateKey);
  if (!existing.ok) {
    return existing.error;
  }

  const mergedNotes =
    existing.data && input.append_notes && notes
      ? [existing.data.notes, notes].filter(Boolean).join("\n\n")
      : notes ?? existing.data?.notes ?? undefined;

  const mergedExtra = existing.data
    ? mergeCheckinExtra(existing.data.extra, patchExtra)
    : patchExtra;

  let itemId: string;
  let notionPageId = existing.data?.notion_page_id ?? undefined;

  if (existing.data) {
    if (notionPageId) {
      await mirrorUpdateItem(input.userProfileId, list, notionPageId, {
        title: dateKey,
        notes: mergedNotes,
      });
    }

    const updated = await updateListItem(existing.data.id, {
      notes: mergedNotes,
      extra: mergedExtra,
    });
    if (!updated.ok) {
      return updated.error;
    }
    itemId = updated.data.id;
  } else {
    notionPageId =
      (await mirrorCreateItem(input.userProfileId, list, {
        title: dateKey,
        notes: mergedNotes,
        extra: mergedExtra,
      })) ?? undefined;

    const saved = await insertListItem({
      userProfileId: input.userProfileId,
      listId: list.id,
      title: dateKey,
      notes: mergedNotes,
      extra: mergedExtra,
      notionPageId,
    });
    if (!saved.ok) {
      return `Could not save check-in: ${saved.error}`;
    }
    itemId = saved.data.id;
  }

  const lifeosLines = await syncCheckinLifeosWriters({
    userProfileId: input.userProfileId,
    dateKey,
    notes: mergedNotes,
    joy_score: input.joy_score,
    health_score: input.health_score,
    wealth_score: input.wealth_score,
    wisdom_score: input.wisdom_score,
    health_status: input.health_status,
    wealth_status: input.wealth_status,
    wisdom_status: input.wisdom_status,
  });

  const mirrorNote = notionPageId ? " Mirrored to Notion." : "";
  const lifeosNote = lifeosLines.length > 0 ? `\n${lifeosLines.join("\n")}` : "";
  return `Logged daily check-in for ${dateKey} (id:${itemId}).${mirrorNote}${lifeosNote}`;
}

export async function addGoal(input: {
  userProfileId: string;
  title: string;
  pillar?: string;
  status?: string;
  timeframe?: string;
  description?: string;
}): Promise<string> {
  const listLine = await addListItem({
    userProfileId: input.userProfileId,
    list: "goals",
    title: input.title,
    status: input.status,
    pillar: input.pillar,
  });

  const lifeos = await createLifeosGoal({
    userProfileId: input.userProfileId,
    title: input.title,
    pillar: input.pillar,
    status: input.status,
    timeframe: input.timeframe,
    description: input.description,
  });

  if (!lifeos.ok) {
    return `${listLine}\n(LifeOS goals table: ${lifeos.error})`;
  }
  return `${listLine}\nAlso saved to LifeOS goals (${lifeos.data.id.slice(0, 8)}…).`;
}

/** Export registry shape helpers for scripts — not used at runtime for other users. */
export function registryConfigFromList(list: ListRow): NotionListConfig | null {
  if (!list.notion_data_source_id) {
    return null;
  }
  return {
    dataSourceId: list.notion_data_source_id,
    titleProperty: list.notion_title_property,
    statusProperty: list.notion_status_property ?? undefined,
    defaultStatus: list.default_status ?? undefined,
    openStatuses: list.open_statuses,
  };
}
