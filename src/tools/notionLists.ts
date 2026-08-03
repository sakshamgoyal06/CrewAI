/**
 * Read/write LifeOS list databases in Notion via the registry.
 */
import type { Client } from "@notionhq/client";

import { withNotionRetry } from "./notion.js";
import {
  getListConfig,
  loadNotionRegistry,
  type NotionListKind,
} from "./notionRegistry.js";
import { createNotionClientForUser } from "./notionUser.js";

type PagePropertyValue = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  number?: number | null;
  url?: string | null;
  date?: { start?: string | null } | null;
};

function plainTitle(prop: PagePropertyValue | undefined): string {
  if (!prop) {
    return "";
  }
  if (prop.type === "title" && prop.title?.length) {
    return prop.title.map((t) => t.plain_text ?? "").join("");
  }
  return "";
}

function plainSelect(prop: PagePropertyValue | undefined): string | undefined {
  if (!prop) {
    return undefined;
  }
  if (prop.type === "select") {
    return prop.select?.name;
  }
  if (prop.type === "status") {
    return prop.status?.name;
  }
  return undefined;
}

function plainText(prop: PagePropertyValue | undefined): string | undefined {
  if (!prop) {
    return undefined;
  }
  if (prop.type === "rich_text" && prop.rich_text?.length) {
    return prop.rich_text.map((t) => t.plain_text ?? "").join("").trim() || undefined;
  }
  return undefined;
}

function formatRow(page: { id: string; url?: string | null; properties: Record<string, PagePropertyValue> }, titleProp: string, statusProp?: string): string {
  const title = plainTitle(page.properties[titleProp]) || "(untitled)";
  const status = statusProp ? plainSelect(page.properties[statusProp]) : undefined;
  const bits = [title];
  if (status) {
    bits.push(`[${status}]`);
  }
  bits.push(`id:${page.id}`);
  return bits.join(" ");
}

async function queryListPages(
  client: Client,
  databaseId: string,
  kind: NotionListKind,
  opts: { status?: string; openStatuses?: string[]; limit: number; statusProperty?: string },
): Promise<Array<{ id: string; url?: string | null; properties: Record<string, PagePropertyValue> }>> {
  type Filter =
    | { property: string; select: { equals: string } }
    | { property: string; status: { equals: string } }
    | { or: Filter[] };

  const statusProp = opts.statusProperty ?? "Status";
  const statusFilter = (name: string): Filter =>
    kind === "tasks"
      ? { property: statusProp, status: { equals: name } }
      : { property: statusProp, select: { equals: name } };

  let filter: Filter | undefined;
  if (opts.status) {
    filter = statusFilter(opts.status);
  } else if (opts.openStatuses?.length) {
    filter = { or: opts.openStatuses.map((name) => statusFilter(name)) };
  }

  const res = await withNotionRetry("databases.query", () =>
    client.databases.query({
      database_id: databaseId,
      filter: filter as never,
      page_size: Math.min(Math.max(opts.limit, 1), 50),
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    }),
  );

  return res.results
    .filter((p): p is typeof p & { properties: Record<string, PagePropertyValue> } => "properties" in p)
    .map((p) => ({ id: p.id, url: "url" in p ? (p.url as string | null) : null, properties: p.properties }));
}

/** Uses select for list DBs and status type for the Life Tasks database. */
function buildStatusProperty(statusProperty: string, status: string, kind: NotionListKind): Record<string, unknown> {
  if (kind === "tasks") {
    return { [statusProperty]: { status: { name: status } } };
  }
  return { [statusProperty]: { select: { name: status } } };
}

function buildCreateProperties(
  kind: NotionListKind,
  cfg: { titleProperty: string; statusProperty?: string; defaultStatus?: string },
  input: { title: string; status?: string; notes?: string; url?: string; author?: string; priority?: string },
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    [cfg.titleProperty]: {
      title: [{ type: "text", text: { content: input.title.slice(0, 2000) } }],
    },
  };
  const status = input.status ?? cfg.defaultStatus;
  if (cfg.statusProperty && status) {
    Object.assign(props, buildStatusProperty(cfg.statusProperty, status, kind));
  }
  if (input.notes) {
    props.Notes = {
      rich_text: [{ type: "text", text: { content: input.notes.slice(0, 2000) } }],
    };
  }
  if (input.url) {
    if (kind === "music") {
      props.URL = { url: input.url };
    } else {
      props.URL = { url: input.url };
    }
  }
  if (input.author && kind === "readlist") {
    props.Author = {
      rich_text: [{ type: "text", text: { content: input.author.slice(0, 2000) } }],
    };
  }
  if (input.priority) {
    props.Priority = { select: { name: input.priority } };
  }
  if (kind === "music" && input.author) {
    props.Artist = {
      rich_text: [{ type: "text", text: { content: input.author.slice(0, 2000) } }],
    };
  }
  if (kind === "tasks" && input.status === undefined) {
    // due date handled separately if needed later
  }
  return props;
}

export async function listNotionItems(input: {
  userProfileId: string;
  list: NotionListKind;
  status?: string;
  openOnly?: boolean;
  limit?: number;
}): Promise<string> {
  const notion = await createNotionClientForUser(input.userProfileId);
  if (!notion?.client) {
    return "Notion is not connected for this account.";
  }

  const registry = await loadNotionRegistry(input.userProfileId);
  const cfg = getListConfig(registry, input.list);
  if (!cfg) {
    return `List "${input.list}" is not configured in the Notion registry.`;
  }

  const pages = await queryListPages(notion.client, cfg.dataSourceId, input.list, {
    status: input.status,
    openStatuses: input.openOnly ? cfg.openStatuses : undefined,
    limit: input.limit ?? 15,
    statusProperty: cfg.statusProperty,
  });

  if (pages.length === 0) {
    return `No items in ${input.list}${input.openOnly ? " (open)" : ""}.`;
  }

  const lines = pages.map((p) =>
    formatRow(p, cfg.titleProperty, cfg.statusProperty),
  );
  return `${input.list} (${pages.length}):\n${lines.join("\n")}`;
}

export async function addNotionItem(input: {
  userProfileId: string;
  list: NotionListKind;
  title: string;
  status?: string;
  notes?: string;
  url?: string;
  author?: string;
  priority?: string;
}): Promise<string> {
  const notion = await createNotionClientForUser(input.userProfileId);
  if (!notion?.client) {
    return "Notion is not connected for this account.";
  }

  const registry = await loadNotionRegistry(input.userProfileId);
  const cfg = getListConfig(registry, input.list);
  if (!cfg) {
    return `List "${input.list}" is not configured in the Notion registry.`;
  }

  const title = input.title.trim();
  if (!title) {
    return "Title is required.";
  }

  const properties = buildCreateProperties(input.list, cfg, input);
  const page = await withNotionRetry("pages.create.list", () =>
    notion.client!.pages.create({
      parent: { database_id: cfg.dataSourceId },
      properties: properties as never,
    }),
  );

  return `Added to ${input.list}: "${title}" (Notion id ${page.id}).`;
}

export async function updateNotionItem(input: {
  userProfileId: string;
  list: NotionListKind;
  pageId: string;
  status?: string;
  notes?: string;
  title?: string;
}): Promise<string> {
  const notion = await createNotionClientForUser(input.userProfileId);
  if (!notion?.client) {
    return "Notion is not connected for this account.";
  }

  const registry = await loadNotionRegistry(input.userProfileId);
  const cfg = getListConfig(registry, input.list);
  if (!cfg) {
    return `List "${input.list}" is not configured in the Notion registry.`;
  }

  const properties: Record<string, unknown> = {};
  if (input.title?.trim()) {
    properties[cfg.titleProperty] = {
      title: [{ type: "text", text: { content: input.title.trim().slice(0, 2000) } }],
    };
  }
  if (input.status && cfg.statusProperty) {
    Object.assign(properties, buildStatusProperty(cfg.statusProperty, input.status, input.list));
  }
  if (input.notes) {
    properties.Notes = {
      rich_text: [{ type: "text", text: { content: input.notes.slice(0, 2000) } }],
    };
  }

  if (Object.keys(properties).length === 0) {
    return "Nothing to update — provide status, notes, or title.";
  }

  await withNotionRetry("pages.update.list", () =>
    notion.client!.pages.update({
      page_id: input.pageId.trim(),
      properties: properties as never,
    }),
  );

  return `Updated ${input.list} item ${input.pageId}.`;
}

export async function getNotionCheckin(input: {
  userProfileId: string;
  date?: string;
}): Promise<string> {
  const notion = await createNotionClientForUser(input.userProfileId);
  if (!notion?.client) {
    return "Notion is not connected for this account.";
  }

  const registry = await loadNotionRegistry(input.userProfileId);
  const cfg = getListConfig(registry, "checkins");
  if (!cfg) {
    return "Daily check-ins database is not configured.";
  }

  const dateKey = input.date?.trim() || new Date().toISOString().slice(0, 10);

  const res = await withNotionRetry("databases.query.checkin", () =>
    notion.client!.databases.query({
      database_id: cfg.dataSourceId,
      filter: {
        property: cfg.titleProperty,
        title: { equals: dateKey },
      },
      page_size: 1,
    }),
  );

  const page = res.results[0];
  if (!page || !("properties" in page)) {
    return `No check-in for ${dateKey}.`;
  }

  const props = page.properties as Record<string, PagePropertyValue>;
  const parts = [`Check-in ${dateKey}:`];
  for (const key of [
    "Day Rating",
    "Health Score",
    "Wealth Score",
    "Wisdom Score",
    "Joy Score",
    "How Are You Feeling",
    "Pattern Flags",
  ]) {
    const p = props[key];
    const sel = plainSelect(p);
    const txt = plainText(p);
    const num = p?.type === "number" ? p.number : undefined;
    const val = sel ?? (num != null ? String(num) : txt);
    if (val) {
      parts.push(`${key}: ${val}`);
    }
  }
  parts.push(`id:${page.id}`);
  return parts.join("\n");
}

export async function addNotionGoal(input: {
  userProfileId: string;
  title: string;
  pillar?: string;
  status?: string;
}): Promise<string> {
  const notion = await createNotionClientForUser(input.userProfileId);
  if (!notion?.client) {
    return "Notion is not connected for this account.";
  }

  const registry = await loadNotionRegistry(input.userProfileId);
  const cfg = getListConfig(registry, "goals");
  if (!cfg) {
    return "Goals database is not configured.";
  }

  const pillarMap: Record<string, string> = {
    health: "🏃 Health",
    wealth: "💰 Wealth",
    wisdom: "📚 Wisdom",
    joy: "🌟 Joy",
    happiness: "🌟 Joy",
  };
  const pillarKey = input.pillar?.trim().toLowerCase();
  const pillarSelect = pillarKey ? pillarMap[pillarKey] : undefined;

  const properties: Record<string, unknown> = {
    [cfg.titleProperty]: {
      title: [{ type: "text", text: { content: input.title.slice(0, 2000) } }],
    },
    Status: { select: { name: input.status ?? cfg.defaultStatus ?? "Not Started" } },
  };
  if (pillarSelect) {
    properties.Pillar = { select: { name: pillarSelect } };
  }

  const page = await withNotionRetry("pages.create.goal", () =>
    notion.client!.pages.create({
      parent: { database_id: cfg.dataSourceId },
      properties: properties as never,
    }),
  );

  return `Added goal: "${input.title}" (Notion id ${page.id}).`;
}
