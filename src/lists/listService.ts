/**
 * User-agnostic list orchestration: Supabase canonical, optional Notion mirror per list.
 */
import { loadUserIntegrations } from "../users/userIntegrations.js";
import type { NotionListConfig, NotionRegistry } from "../tools/notionRegistry.js";
import { getStandardTemplate, STANDARD_LIST_TEMPLATES, type ListArchetype } from "./listCatalog.js";
import {
  fetchCheckinFromNotion,
  formatCheckinReply,
  formatItemLine,
  mirrorCreateItem,
  mirrorUpdateItem,
} from "./listNotionMirror.js";
import { describeUnknownList, isValidCustomSlug, normalizeSlug } from "./listSlug.js";
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
  await ensureUserLists(userProfileId);
  const row = await fetchListBySlug(userProfileId, slug);
  if (!row.ok) {
    throw new Error(row.error);
  }
  return row.data;
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

  const status = input.status ?? list.default_status ?? undefined;
  const extra: Record<string, unknown> = {};
  if (input.pillar) {
    extra.pillar = input.pillar;
  }

  const notionPageId = await mirrorCreateItem(input.userProfileId, list, {
    title,
    status,
    notes: input.notes,
    url: input.url,
    author: input.author,
    priority: input.priority,
    extra,
  });

  const saved = await insertListItem({
    userProfileId: input.userProfileId,
    listId: list.id,
    title,
    status,
    notes: input.notes,
    url: input.url,
    author: input.author,
    priority:
      input.priority === "High" || input.priority === "Medium" || input.priority === "Low"
        ? input.priority
        : undefined,
    extra,
    notionPageId: notionPageId ?? undefined,
  });

  if (!saved.ok) {
    return `Could not save to ${list.slug}: ${saved.error}`;
  }

  const mirrorNote = notionPageId ? " (mirrored to Notion)" : "";
  return `Added to ${list.slug}: "${title}" id:${saved.data.id}${mirrorNote}.`;
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

  return `Created list "${slug}" (${inserted.data.display_name}). Add items with add_list_item.`;
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

export async function addGoal(input: {
  userProfileId: string;
  title: string;
  pillar?: string;
  status?: string;
}): Promise<string> {
  return addListItem({
    userProfileId: input.userProfileId,
    list: "goals",
    title: input.title,
    status: input.status,
    pillar: input.pillar,
  });
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
