/**
 * Provision a dedicated Magnus space in Notion after OAuth — hub page, list databases,
 * and journal parent. Uses OAuth public-connection workspace create when available.
 */
import type { Client } from "@notionhq/client";

import { logger } from "../../logger.js";
import { STANDARD_LIST_TEMPLATES, type ListTemplate } from "../../lists/listCatalog.js";
import { ensureUserLists, linkNotionList } from "../../lists/listService.js";
import { fetchUserLists } from "../../lists/listStore.js";
import { createNotionClient, withNotionRetry } from "../../tools/notion.js";
import type { NotionRegistry } from "../../tools/notionRegistry.js";
import { loadUserIntegrations, upsertUserIntegrations } from "../../users/userIntegrations.js";
import { loggableError } from "../../util/loggableError.js";
import { syncRegistryFromLists } from "./notionSetup.js";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const HUB_TITLES = ["Magnus", "Magnus — LifeOS", "Magnus - LifeOS"];
const JOURNAL_PAGE_TITLE = "Journal";

type PropertySchema = Record<string, unknown>;

function selectOptions(names: string[]): PropertySchema {
  return {
    select: {
      options: names.map((name) => ({ name })),
    },
  };
}

function statusOptions(names: string[]): PropertySchema {
  return {
    status: {
      options: names.map((name, i) => ({
        name,
        color: i === 0 ? "default" : i === names.length - 1 ? "green" : "blue",
      })),
    },
  };
}

/** Build Notion database property schema for a list template. */
export function notionPropertiesForTemplate(template: ListTemplate): PropertySchema {
  const props: PropertySchema = {};

  if (template.archetype === "checkin_log") {
    props[template.notionTitleProperty] = { date: {} };
    props.Notes = { rich_text: {} };
    return props;
  }

  props[template.notionTitleProperty] = { title: {} };

  if (template.notionStatusProperty && template.openStatuses.length > 0) {
    props[template.notionStatusProperty] =
      template.notionStatusKind === "status"
        ? statusOptions(template.openStatuses)
        : selectOptions(template.openStatuses);
  }

  if (template.archetype === "reading_queue") {
    props.Author = { rich_text: {} };
  }
  if (template.archetype === "music_queue") {
    props.Artist = { rich_text: {} };
  }
  if (template.archetype === "media_queue" || template.archetype === "music_queue") {
    props.URL = { url: {} };
  }
  if (template.archetype === "goal_queue") {
    props.Pillar = {
      select: {
        options: [
          { name: "🏃 Health" },
          { name: "💰 Wealth" },
          { name: "📚 Wisdom" },
          { name: "🌟 Joy" },
        ],
      },
    };
  }

  props.Notes = { rich_text: {} };
  return props;
}

function emojiForSlug(slug: string): string {
  const map: Record<string, string> = {
    watchlist: "🎬",
    readlist: "📚",
    travel: "✈️",
    food: "🍜",
    music: "🎵",
    tasks: "✅",
    goals: "🎯",
    patterns: "🔍",
    experiences: "✨",
    checkins: "🌙",
  };
  return map[slug] ?? "📋";
}

async function createWorkspacePage(token: string, title: string): Promise<string | null> {
  try {
    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { workspace: true },
        properties: {
          title: {
            title: [{ type: "text", text: { content: title.slice(0, 2000) } }],
          },
        },
        icon: { type: "emoji", emoji: "🧭" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body: body.slice(0, 300) }, "notion: workspace page create failed");
      return null;
    }
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion: workspace page create error");
    return null;
  }
}

async function createChildPage(
  client: Client,
  parentPageId: string,
  title: string,
): Promise<string | null> {
  try {
    const page = await withNotionRetry("pages.create.child", () =>
      client.pages.create({
        parent: { page_id: parentPageId },
        properties: {
          title: {
            title: [{ type: "text", text: { content: title.slice(0, 2000) } }],
          },
        },
      }),
    );
    return page.id;
  } catch (e) {
    logger.warn({ err: loggableError(e), title }, "notion: child page create failed");
    return null;
  }
}

async function findChildPageByTitle(
  client: Client,
  parentPageId: string,
  title: string,
): Promise<string | null> {
  try {
    const res = await withNotionRetry("blocks.children.list", () =>
      client.blocks.children.list({ block_id: parentPageId, page_size: 100 }),
    );
    for (const block of res.results) {
      if (
        "type" in block &&
        block.type === "child_page" &&
        "child_page" in block &&
        block.child_page.title?.trim() === title
      ) {
        return block.id;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function createListDatabase(
  client: Client,
  parentPageId: string,
  template: ListTemplate,
): Promise<string | null> {
  const dbTitle = `${emojiForSlug(template.slug)} ${template.displayName}`;
  try {
    const db = await withNotionRetry("databases.create", () =>
      client.databases.create({
        parent: { page_id: parentPageId },
        title: [{ type: "text", text: { content: dbTitle } }],
        properties: notionPropertiesForTemplate(template) as Parameters<
          Client["databases"]["create"]
        >[0]["properties"],
      }),
    );
    return db.id;
  } catch (e) {
    logger.warn({ err: loggableError(e), slug: template.slug }, "notion: list database create failed");
    return null;
  }
}

async function createCustomListDatabase(
  client: Client,
  parentPageId: string,
  displayName: string,
): Promise<string | null> {
  try {
    const db = await withNotionRetry("databases.create.custom", () =>
      client.databases.create({
        parent: { page_id: parentPageId },
        title: [{ type: "text", text: { content: `📋 ${displayName}`.slice(0, 2000) } }],
        properties: {
          Title: { title: {} },
          Status: {
            select: {
              options: [
                { name: "Open" },
                { name: "In progress" },
                { name: "Done" },
              ],
            },
          },
          Notes: { rich_text: {} },
        },
      }),
    );
    return db.id;
  } catch (e) {
    logger.warn({ err: loggableError(e), displayName }, "notion: custom list database create failed");
    return null;
  }
}

async function hubPageAccessible(client: Client, hubPageId: string): Promise<boolean> {
  try {
    await client.pages.retrieve({ page_id: hubPageId });
    return true;
  } catch {
    return false;
  }
}

async function resolveOrCreateHub(
  client: Client,
  token: string,
  existingHubId?: string,
): Promise<string | null> {
  if (existingHubId && (await hubPageAccessible(client, existingHubId))) {
    return existingHubId;
  }

  for (const title of HUB_TITLES) {
    try {
      const res = await client.search({
        query: title,
        filter: { property: "object", value: "page" },
        page_size: 5,
      });
      for (const item of res.results) {
        if (item.object !== "page") {
          continue;
        }
        const pageTitle =
          "properties" in item &&
          item.properties &&
          "title" in item.properties &&
          Array.isArray(item.properties.title)
            ? item.properties.title.map((t) => ("plain_text" in t ? t.plain_text : "")).join("")
            : "";
        if (pageTitle.trim() === title) {
          return item.id;
        }
      }
    } catch {
      // continue
    }
  }

  return createWorkspacePage(token, HUB_TITLES[0]!);
}

export type ProvisionResult = {
  hubPageId: string;
  journalPageId: string;
  created: string[];
  skipped: string[];
  failed: string[];
};

/**
 * Create or complete the Magnus Notion space: hub page, Journal subpage, and standard list databases.
 */
export async function provisionMagnusNotionSpace(
  userProfileId: string,
  options?: { forceFreshHub?: boolean },
): Promise<string> {
  const integrations = await loadUserIntegrations(userProfileId);
  const token = integrations.notionToken?.trim();
  if (!token) {
    return "Connect Notion first — say connect Notion.";
  }

  const client = createNotionClient(token);
  if (!client) {
    return "Notion client could not be created.";
  }

  await ensureUserLists(userProfileId);

  const registry = (integrations.notionRegistry as NotionRegistry | undefined) ?? { lists: {} };
  const existingHub = options?.forceFreshHub
    ? registry.hubPageId
    : registry.hubPageId ?? integrations.notionDailyLogParentPageId ?? undefined;

  const hubPageId = await resolveOrCreateHub(client, token, existingHub);
  if (!hubPageId) {
    return "Could not create Magnus hub page in Notion. Ensure OAuth completed and try connect Notion again.";
  }

  let journalPageId =
    typeof (registry as Record<string, unknown>).journalPageId === "string"
      ? ((registry as Record<string, unknown>).journalPageId as string)
      : undefined;
  if (!journalPageId || !(await hubPageAccessible(client, journalPageId))) {
    journalPageId =
      (await findChildPageByTitle(client, hubPageId, JOURNAL_PAGE_TITLE)) ??
      (await createChildPage(client, hubPageId, JOURNAL_PAGE_TITLE)) ??
      hubPageId;
  }

  const result: ProvisionResult = {
    hubPageId,
    journalPageId,
    created: [],
    skipped: [],
    failed: [],
  };

  const lists = await fetchUserLists(userProfileId);
  const listRows = lists.ok ? lists.data : [];

  for (const template of STANDARD_LIST_TEMPLATES) {
    const row = listRows.find((l) => l.slug === template.slug);
    if (row?.notion_data_source_id) {
      result.skipped.push(template.slug);
      continue;
    }

    const dbId = await createListDatabase(client, hubPageId, template);
    if (!dbId) {
      result.failed.push(template.slug);
      continue;
    }

    await linkNotionList({
      userProfileId,
      slug: template.slug,
      notionDatabaseId: dbId,
      titleProperty: template.notionTitleProperty,
      statusProperty: template.notionStatusProperty,
      statusKind: template.notionStatusKind,
    });
    result.created.push(template.slug);
  }

  const nextRegistry: Record<string, unknown> = {
    ...registry,
    hubPageId,
    journalPageId,
    provisionedAt: new Date().toISOString(),
    lists: {},
  };

  await upsertUserIntegrations({
    userProfileId,
    notionDailyLogParentPageId: journalPageId,
    notionMorningBriefParentPageId: journalPageId,
    notionRegistry: nextRegistry,
  });

  await syncRegistryFromLists(userProfileId);

  const lines = [
    "Magnus Notion space ready.",
    `Hub: ${hubPageId}`,
    `Journal (daily logs + briefs): ${journalPageId}`,
  ];
  if (result.created.length) {
    lines.push("", `Created list databases: ${result.created.join(", ")}`);
  }
  if (result.skipped.length) {
    lines.push(`Already linked: ${result.skipped.join(", ")}`);
  }
  if (result.failed.length) {
    lines.push(`Could not create: ${result.failed.join(", ")} — lists still work in Magnus (Supabase).`);
  }
  lines.push("", "Open the Magnus page in Notion to browse catalogs. Magnus reads and mirrors here automatically.");
  return lines.join("\n");
}

/** Create a Notion database for a custom list slug under the user's Magnus hub. */
export async function provisionNotionDatabaseForCustomList(input: {
  userProfileId: string;
  slug: string;
  displayName: string;
}): Promise<string | null> {
  const integrations = await loadUserIntegrations(input.userProfileId);
  const token = integrations.notionToken?.trim();
  if (!token) {
    return null;
  }

  const client = createNotionClient(token);
  if (!client) {
    return null;
  }

  const registry = integrations.notionRegistry as NotionRegistry | undefined;
  const hubPageId =
    registry?.hubPageId ?? integrations.notionDailyLogParentPageId ?? undefined;
  if (!hubPageId || !(await hubPageAccessible(client, hubPageId))) {
    return null;
  }

  const dbId = await createCustomListDatabase(client, hubPageId, input.displayName);
  if (!dbId) {
    return null;
  }

  await linkNotionList({
    userProfileId: input.userProfileId,
    slug: input.slug,
    notionDatabaseId: dbId,
    titleProperty: "Title",
    statusProperty: "Status",
    statusKind: "select",
  });

  await syncRegistryFromLists(input.userProfileId);
  return dbId;
}
