/**
 * Supabase access for per-user list catalog and canonical list items.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { supabase as defaultClient } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import type { ListArchetype } from "./listCatalog.js";

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ListRow = {
  id: string;
  user_profile_id: string;
  slug: string;
  display_name: string;
  archetype: ListArchetype;
  description: string | null;
  pillar: string | null;
  notion_data_source_id: string | null;
  notion_title_property: string;
  notion_status_property: string | null;
  notion_status_kind: "select" | "status";
  default_status: string | null;
  open_statuses: string[];
  metadata: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ListItemRow = {
  id: string;
  user_profile_id: string;
  list_id: string;
  title: string;
  status: string | null;
  notes: string | null;
  url: string | null;
  author: string | null;
  priority: "High" | "Medium" | "Low" | null;
  extra: Record<string, unknown>;
  notion_page_id: string | null;
  completed_at: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type ListStoreDeps = { client?: SupabaseClient };

const LISTS = "magnus_user_lists";
const ITEMS = "magnus_list_items";

function client(deps?: ListStoreDeps): SupabaseClient {
  return deps?.client ?? defaultClient;
}

function fail(context: string, error: unknown): { ok: false; error: string } {
  const message =
    (error as { message?: string } | null)?.message ??
    (error instanceof Error ? error.message : String(error));
  logger.warn({ err: loggableError(error), context }, "list store query failed");
  return { ok: false, error: message };
}

function rowToList(data: Record<string, unknown>): ListRow {
  const openStatuses = data.open_statuses;
  return {
    id: String(data.id),
    user_profile_id: String(data.user_profile_id),
    slug: String(data.slug),
    display_name: String(data.display_name),
    archetype: data.archetype as ListArchetype,
    description: data.description != null ? String(data.description) : null,
    pillar: data.pillar != null ? String(data.pillar) : null,
    notion_data_source_id:
      data.notion_data_source_id != null ? String(data.notion_data_source_id) : null,
    notion_title_property: String(data.notion_title_property ?? "Title"),
    notion_status_property:
      data.notion_status_property != null ? String(data.notion_status_property) : null,
    notion_status_kind: (data.notion_status_kind as "select" | "status") ?? "select",
    default_status: data.default_status != null ? String(data.default_status) : null,
    open_statuses: Array.isArray(openStatuses)
      ? openStatuses.filter((s): s is string => typeof s === "string")
      : [],
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : {},
    active: data.active !== false,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  };
}

function rowToItem(data: Record<string, unknown>): ListItemRow {
  return {
    id: String(data.id),
    user_profile_id: String(data.user_profile_id),
    list_id: String(data.list_id),
    title: String(data.title),
    status: data.status != null ? String(data.status) : null,
    notes: data.notes != null ? String(data.notes) : null,
    url: data.url != null ? String(data.url) : null,
    author: data.author != null ? String(data.author) : null,
    priority:
      data.priority === "High" || data.priority === "Medium" || data.priority === "Low"
        ? data.priority
        : null,
    extra:
      data.extra && typeof data.extra === "object"
        ? (data.extra as Record<string, unknown>)
        : {},
    notion_page_id: data.notion_page_id != null ? String(data.notion_page_id) : null,
    completed_at: data.completed_at != null ? String(data.completed_at) : null,
    is_deleted: data.is_deleted === true,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  };
}

export async function fetchUserLists(
  userProfileId: string,
  deps?: ListStoreDeps,
): Promise<StoreResult<ListRow[]>> {
  const { data, error } = await client(deps)
    .from(LISTS)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("active", true)
    .order("slug");

  if (error) {
    return fail("fetchUserLists", error);
  }
  return { ok: true, data: (data ?? []).map((r) => rowToList(r as Record<string, unknown>)) };
}

export async function fetchListBySlug(
  userProfileId: string,
  slug: string,
  deps?: ListStoreDeps,
): Promise<StoreResult<ListRow | null>> {
  const { data, error } = await client(deps)
    .from(LISTS)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return fail("fetchListBySlug", error);
  }
  if (!data) {
    return { ok: true, data: null };
  }
  return { ok: true, data: rowToList(data as Record<string, unknown>) };
}

export async function insertList(
  input: {
    userProfileId: string;
    slug: string;
    displayName: string;
    archetype: ListArchetype;
    description?: string;
    pillar?: string;
    notionDataSourceId?: string;
    notionTitleProperty?: string;
    notionStatusProperty?: string;
    notionStatusKind?: "select" | "status";
    defaultStatus?: string;
    openStatuses?: string[];
    metadata?: Record<string, unknown>;
  },
  deps?: ListStoreDeps,
): Promise<StoreResult<ListRow>> {
  const now = new Date().toISOString();
  const row = {
    user_profile_id: input.userProfileId,
    slug: input.slug,
    display_name: input.displayName,
    archetype: input.archetype,
    description: input.description ?? null,
    pillar: input.pillar ?? null,
    notion_data_source_id: input.notionDataSourceId ?? null,
    notion_title_property: input.notionTitleProperty ?? "Title",
    notion_status_property: input.notionStatusProperty ?? null,
    notion_status_kind: input.notionStatusKind ?? "select",
    default_status: input.defaultStatus ?? null,
    open_statuses: input.openStatuses ?? [],
    metadata: input.metadata ?? {},
    active: true,
    updated_at: now,
  };

  const { data, error } = await client(deps).from(LISTS).insert(row).select("*").single();
  if (error) {
    return fail("insertList", error);
  }
  return { ok: true, data: rowToList(data as Record<string, unknown>) };
}

export async function updateList(
  listId: string,
  patch: Partial<{
    displayName: string;
    notionDataSourceId: string | null;
    notionTitleProperty: string;
    notionStatusProperty: string | null;
    notionStatusKind: "select" | "status";
    defaultStatus: string | null;
    openStatuses: string[];
    metadata: Record<string, unknown>;
    active: boolean;
  }>,
  deps?: ListStoreDeps,
): Promise<StoreResult<ListRow>> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.displayName !== undefined) {
    row.display_name = patch.displayName;
  }
  if (patch.notionDataSourceId !== undefined) {
    row.notion_data_source_id = patch.notionDataSourceId;
  }
  if (patch.notionTitleProperty !== undefined) {
    row.notion_title_property = patch.notionTitleProperty;
  }
  if (patch.notionStatusProperty !== undefined) {
    row.notion_status_property = patch.notionStatusProperty;
  }
  if (patch.notionStatusKind !== undefined) {
    row.notion_status_kind = patch.notionStatusKind;
  }
  if (patch.defaultStatus !== undefined) {
    row.default_status = patch.defaultStatus;
  }
  if (patch.openStatuses !== undefined) {
    row.open_statuses = patch.openStatuses;
  }
  if (patch.metadata !== undefined) {
    row.metadata = patch.metadata;
  }
  if (patch.active !== undefined) {
    row.active = patch.active;
  }

  const { data, error } = await client(deps)
    .from(LISTS)
    .update(row)
    .eq("id", listId)
    .select("*")
    .single();

  if (error) {
    return fail("updateList", error);
  }
  return { ok: true, data: rowToList(data as Record<string, unknown>) };
}

export async function queryListItems(
  input: {
    userProfileId: string;
    listId: string;
    status?: string;
    openStatuses?: string[];
    limit?: number;
  },
  deps?: ListStoreDeps,
): Promise<StoreResult<ListItemRow[]>> {
  let q = client(deps)
    .from(ITEMS)
    .select("*")
    .eq("user_profile_id", input.userProfileId)
    .eq("list_id", input.listId)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 15, 1), 50));

  if (input.status) {
    q = q.eq("status", input.status);
  } else if (input.openStatuses?.length) {
    q = q.in("status", input.openStatuses);
  }

  const { data, error } = await q;
  if (error) {
    return fail("queryListItems", error);
  }
  return { ok: true, data: (data ?? []).map((r) => rowToItem(r as Record<string, unknown>)) };
}

export async function fetchListItemById(
  userProfileId: string,
  itemId: string,
  deps?: ListStoreDeps,
): Promise<StoreResult<ListItemRow | null>> {
  const { data, error } = await client(deps)
    .from(ITEMS)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("id", itemId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    return fail("fetchListItemById", error);
  }
  if (!data) {
    return { ok: true, data: null };
  }
  return { ok: true, data: rowToItem(data as Record<string, unknown>) };
}

export async function insertListItem(
  input: {
    userProfileId: string;
    listId: string;
    title: string;
    status?: string;
    notes?: string;
    url?: string;
    author?: string;
    priority?: "High" | "Medium" | "Low";
    extra?: Record<string, unknown>;
    notionPageId?: string;
  },
  deps?: ListStoreDeps,
): Promise<StoreResult<ListItemRow>> {
  const row = {
    user_profile_id: input.userProfileId,
    list_id: input.listId,
    title: input.title.trim(),
    status: input.status ?? null,
    notes: input.notes ?? null,
    url: input.url ?? null,
    author: input.author ?? null,
    priority: input.priority ?? null,
    extra: input.extra ?? {},
    notion_page_id: input.notionPageId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client(deps).from(ITEMS).insert(row).select("*").single();
  if (error) {
    return fail("insertListItem", error);
  }
  return { ok: true, data: rowToItem(data as Record<string, unknown>) };
}

export async function updateListItem(
  itemId: string,
  patch: Partial<{
    title: string;
    status: string;
    notes: string;
    url: string;
    author: string;
    priority: "High" | "Medium" | "Low" | null;
    extra: Record<string, unknown>;
    notionPageId: string | null;
    completedAt: string | null;
    isDeleted: boolean;
  }>,
  deps?: ListStoreDeps,
): Promise<StoreResult<ListItemRow>> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    row.title = patch.title;
  }
  if (patch.status !== undefined) {
    row.status = patch.status;
  }
  if (patch.notes !== undefined) {
    row.notes = patch.notes;
  }
  if (patch.url !== undefined) {
    row.url = patch.url;
  }
  if (patch.author !== undefined) {
    row.author = patch.author;
  }
  if (patch.priority !== undefined) {
    row.priority = patch.priority;
  }
  if (patch.extra !== undefined) {
    row.extra = patch.extra;
  }
  if (patch.notionPageId !== undefined) {
    row.notion_page_id = patch.notionPageId;
  }
  if (patch.completedAt !== undefined) {
    row.completed_at = patch.completedAt;
  }
  if (patch.isDeleted !== undefined) {
    row.is_deleted = patch.isDeleted;
  }

  const { data, error } = await client(deps)
    .from(ITEMS)
    .update(row)
    .eq("id", itemId)
    .select("*")
    .single();

  if (error) {
    return fail("updateListItem", error);
  }
  return { ok: true, data: rowToItem(data as Record<string, unknown>) };
}

export async function fetchCheckinItem(
  userProfileId: string,
  listId: string,
  dateKey: string,
  deps?: ListStoreDeps,
): Promise<StoreResult<ListItemRow | null>> {
  const { data, error } = await client(deps)
    .from(ITEMS)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("list_id", listId)
    .eq("title", dateKey)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    return fail("fetchCheckinItem", error);
  }
  if (!data) {
    return { ok: true, data: null };
  }
  return { ok: true, data: rowToItem(data as Record<string, unknown>) };
}
