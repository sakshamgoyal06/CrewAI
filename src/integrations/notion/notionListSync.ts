/**
 * Bidirectional Supabase ↔ Notion sync for user lists.
 * Supabase is canonical — conflicts push Supabase → Notion.
 */
import type { Client } from "@notionhq/client";

import { logger } from "../../logger.js";
import { getStandardTemplate } from "../../lists/listCatalog.js";
import { ensureUserLists } from "../../lists/listService.js";
import {
  mirrorCreateItem,
  mirrorUpdateItem,
  parseNotionListPage,
} from "../../lists/listNotionMirror.js";
import {
  fetchUserLists,
  insertListItem,
  queryListItems,
  updateListItem,
  type ListRow,
} from "../../lists/listStore.js";
import { createNotionClient, withNotionRetry } from "../../tools/notion.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import { loggableError } from "../../util/loggableError.js";
import { notionPropertiesForTemplate, provisionMagnusNotionSpace, provisionNotionDatabaseForCustomList } from "./notionProvision.js";
import { syncRegistryFromLists } from "./notionSetup.js";

export type ListSyncStats = {
  listsCreated: string[];
  schemaPatched: string[];
  pushedToNotion: number;
  updatedInNotion: number;
  pulledFromNotion: number;
  skipped: string[];
  errors: string[];
};

type PropertySchema = Record<string, unknown>;

function genericListSchema(): PropertySchema {
  return {
    Title: { title: {} },
    Status: {
      select: {
        options: [{ name: "Open" }, { name: "In progress" }, { name: "Done" }],
      },
    },
    Notes: { rich_text: {} },
  };
}

function expectedSchemaForList(list: ListRow): PropertySchema {
  const template = getStandardTemplate(list.slug);
  if (template) {
    return notionPropertiesForTemplate(template);
  }
  return genericListSchema();
}

async function ensureListDatabase(
  userProfileId: string,
  list: ListRow,
): Promise<ListRow | null> {
  if (list.notion_data_source_id) {
    return list;
  }

  const template = getStandardTemplate(list.slug);
  if (template) {
    return list;
  }

  const dbId = await provisionNotionDatabaseForCustomList({
    userProfileId,
    slug: list.slug,
    displayName: list.display_name,
  });
  if (!dbId) {
    return null;
  }

  const refreshed = await fetchUserLists(userProfileId);
  if (!refreshed.ok) {
    return null;
  }
  return refreshed.data.find((l) => l.slug === list.slug) ?? null;
}

async function ensureDatabaseSchema(
  client: Client,
  list: ListRow,
): Promise<boolean> {
  if (!list.notion_data_source_id) {
    return false;
  }

  const expected = expectedSchemaForList(list);
  try {
    const db = await withNotionRetry("databases.retrieve.sync", () =>
      client.databases.retrieve({ database_id: list.notion_data_source_id! }),
    );
    const existing = db.properties ?? {};
    const patch: PropertySchema = {};
    for (const [name, schema] of Object.entries(expected)) {
      if (!(name in existing)) {
        patch[name] = schema;
      }
    }
    if (Object.keys(patch).length === 0) {
      return false;
    }
    await withNotionRetry("databases.update.sync", () =>
      client.databases.update({
        database_id: list.notion_data_source_id!,
        properties: patch as never,
      }),
    );
    return true;
  } catch (e) {
    logger.warn({ err: loggableError(e), slug: list.slug }, "notion schema sync failed");
    throw e;
  }
}

async function queryAllNotionPages(
  client: Client,
  databaseId: string,
): Promise<Array<{ id: string; properties: Record<string, unknown>; archived: boolean }>> {
  const out: Array<{ id: string; properties: Record<string, unknown>; archived: boolean }> = [];
  let cursor: string | undefined;
  do {
    const res = await withNotionRetry("databases.query.sync", () =>
      client.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );
    for (const page of res.results) {
      if (!("properties" in page)) {
        continue;
      }
      out.push({
        id: page.id,
        properties: page.properties as Record<string, unknown>,
        archived: "archived" in page ? Boolean(page.archived) : false,
      });
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

async function syncListItems(
  userProfileId: string,
  list: ListRow,
  client: Client,
  stats: ListSyncStats,
): Promise<void> {
  if (!list.notion_data_source_id) {
    stats.skipped.push(`${list.slug} (no Notion database)`);
    return;
  }

  const items = await queryListItems({
    userProfileId,
    listId: list.id,
    limit: 500,
  });
  if (!items.ok) {
    stats.errors.push(`${list.slug}: ${items.error}`);
    return;
  }

  const byNotionId = new Map<string, (typeof items.data)[0]>();
  for (const item of items.data) {
    if (item.notion_page_id) {
      byNotionId.set(item.notion_page_id, item);
    }
  }

  let notionPages: Awaited<ReturnType<typeof queryAllNotionPages>>;
  try {
    notionPages = await queryAllNotionPages(client, list.notion_data_source_id);
  } catch (e) {
    stats.errors.push(
      `${list.slug}: could not read Notion (${e instanceof Error ? e.message : String(e)})`,
    );
    return;
  }

  const seenNotionIds = new Set<string>();

  for (const item of items.data) {
    if (item.notion_page_id) {
      seenNotionIds.add(item.notion_page_id);
      const updated = await mirrorUpdateItem(userProfileId, list, item.notion_page_id, {
        title: item.title,
        status: item.status ?? undefined,
        notes: item.notes ?? undefined,
      });
      if (updated) {
        stats.updatedInNotion++;
      }
      continue;
    }

    const notionPageId = await mirrorCreateItem(userProfileId, list, {
      title: item.title,
      status: item.status ?? undefined,
      notes: item.notes ?? undefined,
      url: item.url ?? undefined,
      author: item.author ?? undefined,
      priority: item.priority ?? undefined,
      extra: item.extra,
    });
    if (notionPageId) {
      seenNotionIds.add(notionPageId);
      const saved = await updateListItem(item.id, { notionPageId });
      if (saved.ok) {
        stats.pushedToNotion++;
      } else {
        stats.errors.push(`${list.slug} item ${item.id}: ${saved.error}`);
      }
    } else {
      stats.errors.push(`${list.slug}: could not push "${item.title}" to Notion`);
    }
  }

  for (const page of notionPages) {
    if (page.archived || seenNotionIds.has(page.id) || byNotionId.has(page.id)) {
      continue;
    }

    const parsed = parseNotionListPage(
      list,
      page.properties as Parameters<typeof parseNotionListPage>[1],
    );
    if (!parsed) {
      continue;
    }

    const saved = await insertListItem({
      userProfileId,
      listId: list.id,
      title: parsed.title,
      status: parsed.status,
      notes: parsed.notes,
      url: parsed.url,
      author: parsed.author,
      priority: parsed.priority,
      extra: parsed.extra,
      notionPageId: page.id,
    });
    if (saved.ok) {
      stats.pulledFromNotion++;
    } else {
      stats.errors.push(`${list.slug} pull "${parsed.title}": ${saved.error}`);
    }
  }
}

/** Ensure missing list DBs, patch schema, sync all entries both ways (Supabase wins on conflicts). */
export async function syncSupabaseToNotion(userProfileId: string): Promise<string> {
  const integrations = await loadUserIntegrations(userProfileId);
  if (!integrations.notionToken) {
    return "Notion is not connected — say connect Notion first.";
  }

  const client = createNotionClient(integrations.notionToken);
  if (!client) {
    return "Could not create Notion client.";
  }

  await ensureUserLists(userProfileId);

  const stats: ListSyncStats = {
    listsCreated: [],
    schemaPatched: [],
    pushedToNotion: 0,
    updatedInNotion: 0,
    pulledFromNotion: 0,
    skipped: [],
    errors: [],
  };

  const beforeLists = await fetchUserLists(userProfileId);
  const linkedBefore = new Set(
    beforeLists.ok
      ? beforeLists.data.filter((l) => l.notion_data_source_id).map((l) => l.slug)
      : [],
  );

  const unlinkedBefore = beforeLists.ok
    ? beforeLists.data.filter((l) => !l.notion_data_source_id).length
    : 0;

  if (unlinkedBefore > 0) {
    await provisionMagnusNotionSpace(userProfileId);
  }

  let lists = await fetchUserLists(userProfileId);
  if (!lists.ok) {
    return `Could not load lists: ${lists.error}`;
  }

  for (const list of lists.data) {
    if (!linkedBefore.has(list.slug) && list.notion_data_source_id) {
      stats.listsCreated.push(list.slug);
    }
  }

  for (const list of lists.data) {
    if (list.notion_data_source_id) {
      continue;
    }
    const ensured = await ensureListDatabase(userProfileId, list);
    if (ensured?.notion_data_source_id && !stats.listsCreated.includes(list.slug)) {
      stats.listsCreated.push(list.slug);
    } else if (!ensured?.notion_data_source_id) {
      stats.skipped.push(`${list.slug} (no Notion database)`);
    }
  }

  lists = await fetchUserLists(userProfileId);
  if (!lists.ok) {
    return `Could not reload lists: ${lists.error}`;
  }

  for (const list of lists.data) {
    if (!list.notion_data_source_id) {
      continue;
    }
    try {
      if (await ensureDatabaseSchema(client, list)) {
        stats.schemaPatched.push(list.slug);
      }
    } catch (e) {
      stats.errors.push(
        `${list.slug} schema: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await syncListItems(userProfileId, list, client, stats);
  }

  await syncRegistryFromLists(userProfileId);

  return formatSyncSummary(stats);
}

export function formatSyncSummary(stats: ListSyncStats): string {
  const lines = ["Supabase ↔ Notion sync complete."];

  if (stats.listsCreated.length) {
    lines.push(`List databases created: ${stats.listsCreated.join(", ")}`);
  }
  if (stats.schemaPatched.length) {
    lines.push(`Schema patched: ${stats.schemaPatched.join(", ")}`);
  }

  lines.push(
    `Pushed to Notion: ${stats.pushedToNotion}`,
    `Updated in Notion: ${stats.updatedInNotion}`,
    `Pulled from Notion: ${stats.pulledFromNotion}`,
  );

  if (stats.skipped.length) {
    lines.push(`Skipped: ${stats.skipped.join("; ")}`);
  }
  if (stats.errors.length) {
    lines.push("", "Issues:", ...stats.errors.slice(0, 8).map((e) => `- ${e}`));
    if (stats.errors.length > 8) {
      lines.push(`- …and ${stats.errors.length - 8} more`);
    }
  }

  return lines.join("\n");
}
