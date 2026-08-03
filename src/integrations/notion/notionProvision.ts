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
/** Workspace-level page create needs a recent Notion-Version (2022-06-28 rejects parent.workspace). */
const NOTION_PROVISION_VERSION = "2026-03-11";
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
  const bodies = [
    {
      parent: { workspace: true },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title.slice(0, 2000) } }],
        },
      },
      icon: { type: "emoji", emoji: "🧭" },
    },
    // Newer API also accepts omitting parent for workspace-level private pages.
    {
      properties: {
        title: {
          title: [{ type: "text", text: { content: title.slice(0, 2000) } }],
        },
      },
      icon: { type: "emoji", emoji: "🧭" },
    },
  ];

  for (const body of bodies) {
    try {
      const res = await fetch(`${NOTION_API}/pages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_PROVISION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text();
        logger.warn(
          { status: res.status, body: errBody.slice(0, 300) },
          "notion: workspace page create attempt failed",
        );
        continue;
      }
      const data = (await res.json()) as { id?: string };
      if (data.id) {
        return data.id;
      }
    } catch (e) {
      logger.warn({ err: loggableError(e) }, "notion: workspace page create error");
    }
  }
  return null;
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

type AccessiblePage = { id: string; title: string };

function pageTitleFromProperties(properties: Record<string, unknown>): string {
  for (const val of Object.values(properties)) {
    if (val && typeof val === "object" && (val as { type?: string }).type === "title") {
      const title = (val as { title?: Array<{ plain_text?: string }> }).title ?? [];
      return title.map((t) => t.plain_text ?? "").join("");
    }
  }
  return "";
}

/** Prefer an OAuth-granted page titled Magnus; otherwise null. */
export function pickGrantedHubPage(pages: AccessiblePage[]): string | null {
  for (const hubTitle of HUB_TITLES) {
    const match = pages.find((p) => p.title.trim() === hubTitle);
    if (match) {
      return match.id;
    }
  }
  return null;
}

async function searchAccessiblePages(client: Client): Promise<AccessiblePage[]> {
  try {
    const res = await client.search({
      filter: { property: "object", value: "page" },
      page_size: 25,
    });
    const out: AccessiblePage[] = [];
    for (const item of res.results) {
      if (item.object !== "page" || !("properties" in item)) {
        continue;
      }
      out.push({
        id: item.id,
        title: pageTitleFromProperties(item.properties as Record<string, unknown>),
      });
    }
    return out;
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion: search accessible pages failed");
    return [];
  }
}

async function resolveOrCreateHub(
  client: Client,
  token: string,
  existingHubId?: string,
  options?: { forceFresh?: boolean },
): Promise<string | null> {
  if (existingHubId && (await hubPageAccessible(client, existingHubId))) {
    return existingHubId;
  }

  if (!options?.forceFresh) {
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
            "properties" in item
              ? pageTitleFromProperties(item.properties as Record<string, unknown>)
              : "";
          if (pageTitle.trim() === title) {
            return item.id;
          }
        }
      } catch {
        // continue
      }
    }
  }

  const workspaceHub = await createWorkspacePage(token, HUB_TITLES[0]!);
  if (workspaceHub) {
    return workspaceHub;
  }

  // OAuth page picker grants specific pages — workspace create may be blocked.
  // Use a granted "Magnus" page, or create Magnus under the first granted page.
  const accessible = await searchAccessiblePages(client);
  const grantedHub = pickGrantedHubPage(accessible);
  if (grantedHub) {
    return grantedHub;
  }
  if (accessible.length > 0) {
    const child = await createChildPage(client, accessible[0]!.id, HUB_TITLES[0]!);
    if (child) {
      return child;
    }
    return accessible[0]!.id;
  }

  return null;
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

  const hubPageId = await resolveOrCreateHub(client, token, existingHub, {
    forceFresh: Boolean(options?.forceFreshHub),
  });
  if (!hubPageId) {
    return [
      "Could not create Magnus hub page in Notion.",
      "",
      "During OAuth, Notion asks which pages to share — Magnus creates databases after you approve, not before.",
      "Try again:",
      "1. In Notion, create an empty page called Magnus.",
      "2. Say connect Notion and select that Magnus page in the picker (or any top-level page).",
      "3. Click Allow access.",
      "",
      "Ensure your Notion public connection has Insert content enabled (Developer portal → Capabilities).",
      "Then: setup_notion provision",
    ].join("\n");
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
