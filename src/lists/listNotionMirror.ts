/**
 * Optional Notion mirror for list rows — best-effort, per-user, per-list.
 */
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { withNotionRetry } from "../tools/notion.js";
import { createNotionClientForUser } from "../tools/notionUser.js";
import type { ListItemRow, ListRow } from "./listStore.js";

type PagePropertyValue = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  number?: number | null;
  url?: string | null;
  date?: { start?: string } | null;
};

function buildStatusProperty(
  statusProperty: string,
  status: string,
  kind: "select" | "status",
): Record<string, unknown> {
  if (kind === "status") {
    return { [statusProperty]: { status: { name: status } } };
  }
  return { [statusProperty]: { select: { name: status } } };
}

function buildCreateProperties(
  list: ListRow,
  input: {
    title: string;
    status?: string;
    notes?: string;
    url?: string;
    author?: string;
    priority?: string;
    extra?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    [list.notion_title_property]: {
      title: [{ type: "text", text: { content: input.title.slice(0, 2000) } }],
    },
  };

  const status = input.status ?? list.default_status ?? undefined;
  if (list.notion_status_property && status) {
    Object.assign(
      props,
      buildStatusProperty(list.notion_status_property, status, list.notion_status_kind),
    );
  }

  if (input.notes) {
    props.Notes = {
      rich_text: [{ type: "text", text: { content: input.notes.slice(0, 2000) } }],
    };
  }
  if (input.url) {
    props.URL = { url: input.url };
  }
  if (input.author) {
    if (list.archetype === "reading_queue") {
      props.Author = {
        rich_text: [{ type: "text", text: { content: input.author.slice(0, 2000) } }],
      };
    }
    if (list.archetype === "music_queue") {
      props.Artist = {
        rich_text: [{ type: "text", text: { content: input.author.slice(0, 2000) } }],
      };
    }
  }
  if (input.priority) {
    props.Priority = { select: { name: input.priority } };
  }

  const pillar = input.extra?.pillar;
  if (list.archetype === "goal_queue" && typeof pillar === "string") {
    const pillarMap: Record<string, string> = {
      health: "🏃 Health",
      wealth: "💰 Wealth",
      wisdom: "📚 Wisdom",
      joy: "🌟 Joy",
      happiness: "🌟 Joy",
    };
    const mapped = pillarMap[pillar.toLowerCase()];
    if (mapped) {
      props.Pillar = { select: { name: mapped } };
    }
  }

  return props;
}

export async function mirrorCreateItem(
  userProfileId: string,
  list: ListRow,
  input: {
    title: string;
    status?: string;
    notes?: string;
    url?: string;
    author?: string;
    priority?: string;
    extra?: Record<string, unknown>;
  },
): Promise<string | null> {
  if (!list.notion_data_source_id) {
    return null;
  }

  const notion = await createNotionClientForUser(userProfileId);
  if (!notion?.client) {
    return null;
  }

  try {
    const page = await withNotionRetry("pages.create.list", () =>
      notion.client!.pages.create({
        parent: { database_id: list.notion_data_source_id! },
        properties: buildCreateProperties(list, input) as never,
      }),
    );
    return page.id;
  } catch (e) {
    logger.warn({ err: loggableError(e), slug: list.slug }, "notion list mirror create failed");
    return null;
  }
}

export async function mirrorUpdateItem(
  userProfileId: string,
  list: ListRow,
  notionPageId: string,
  patch: { title?: string; status?: string; notes?: string },
): Promise<boolean> {
  if (!list.notion_data_source_id || !notionPageId) {
    return false;
  }

  const notion = await createNotionClientForUser(userProfileId);
  if (!notion?.client) {
    return false;
  }

  const properties: Record<string, unknown> = {};
  if (patch.title?.trim()) {
    properties[list.notion_title_property] = {
      title: [{ type: "text", text: { content: patch.title.trim().slice(0, 2000) } }],
    };
  }
  if (patch.status && list.notion_status_property) {
    Object.assign(
      properties,
      buildStatusProperty(list.notion_status_property, patch.status, list.notion_status_kind),
    );
  }
  if (patch.notes) {
    properties.Notes = {
      rich_text: [{ type: "text", text: { content: patch.notes.slice(0, 2000) } }],
    };
  }

  if (Object.keys(properties).length === 0) {
    return false;
  }

  try {
    await withNotionRetry("pages.update.list", () =>
      notion.client!.pages.update({
        page_id: notionPageId,
        properties: properties as never,
      }),
    );
    return true;
  } catch (e) {
    logger.warn({ err: loggableError(e), slug: list.slug }, "notion list mirror update failed");
    return false;
  }
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
  if (prop?.type === "rich_text" && prop.rich_text?.length) {
    return prop.rich_text.map((t) => t.plain_text ?? "").join("").trim() || undefined;
  }
  return undefined;
}

/** Pull a check-in row from Notion when Supabase has no copy yet. */
export async function fetchCheckinFromNotion(
  userProfileId: string,
  list: ListRow,
  dateKey: string,
): Promise<{ title: string; extra: Record<string, unknown>; notionPageId: string } | null> {
  if (!list.notion_data_source_id) {
    return null;
  }

  const notion = await createNotionClientForUser(userProfileId);
  if (!notion?.client) {
    return null;
  }

  try {
    const res = await withNotionRetry("databases.query.checkin", () =>
      notion.client!.databases.query({
        database_id: list.notion_data_source_id!,
        filter: {
          property: list.notion_title_property,
          title: { equals: dateKey },
        },
        page_size: 1,
      }),
    );

    const page = res.results[0];
    if (!page || !("properties" in page)) {
      return null;
    }

    const props = page.properties as Record<string, PagePropertyValue>;
    const extra: Record<string, unknown> = {};
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
        extra[key] = val;
      }
    }

    return { title: dateKey, extra, notionPageId: page.id };
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion checkin fetch failed");
    return null;
  }
}

export function formatCheckinReply(dateKey: string, item: ListItemRow): string {
  const parts = [`Check-in ${dateKey}:`];
  for (const [key, val] of Object.entries(item.extra)) {
    if (val != null && val !== "") {
      parts.push(`${key}: ${String(val)}`);
    }
  }
  if (item.status) {
    parts.push(`Status: ${item.status}`);
  }
  if (item.notes) {
    parts.push(`Notes: ${item.notes}`);
  }
  parts.push(`id:${item.id}`);
  return parts.join("\n");
}

export function formatItemLine(item: ListItemRow): string {
  const bits = [item.title];
  if (item.status) {
    bits.push(`[${item.status}]`);
  }
  if (item.created_at) {
    bits.push(`added:${item.created_at.slice(0, 10)}`);
  }
  bits.push(`id:${item.id}`);
  return bits.join(" ");
}

function plainTitle(prop: PagePropertyValue | undefined): string | undefined {
  if (prop?.type === "title" && prop.title?.length) {
    return prop.title.map((t) => t.plain_text ?? "").join("").trim() || undefined;
  }
  return undefined;
}

function plainDate(prop: PagePropertyValue | undefined): string | undefined {
  if (prop?.type === "date" && prop.date && "start" in prop.date && prop.date.start) {
    return String(prop.date.start).slice(0, 10);
  }
  return undefined;
}

/** Parse a Notion list row into Supabase list item fields. */
export function parseNotionListPage(
  list: ListRow,
  properties: Record<string, PagePropertyValue>,
): {
  title: string;
  status?: string;
  notes?: string;
  url?: string;
  author?: string;
  priority?: "High" | "Medium" | "Low";
  extra?: Record<string, unknown>;
} | null {
  const titleProp = properties[list.notion_title_property];
  const title =
    list.archetype === "checkin_log"
      ? plainDate(titleProp) ?? plainTitle(titleProp)
      : plainTitle(titleProp);
  if (!title) {
    return null;
  }

  const statusProp = list.notion_status_property
    ? properties[list.notion_status_property]
    : undefined;
  const status = plainSelect(statusProp);

  const notes = plainText(properties.Notes);
  const urlProp = properties.URL;
  const url = urlProp?.type === "url" && urlProp.url ? String(urlProp.url) : undefined;

  let author: string | undefined;
  if (list.archetype === "reading_queue") {
    author = plainText(properties.Author);
  } else if (list.archetype === "music_queue") {
    author = plainText(properties.Artist);
  }

  const priorityRaw = plainSelect(properties.Priority);
  const priority =
    priorityRaw === "High" || priorityRaw === "Medium" || priorityRaw === "Low"
      ? priorityRaw
      : undefined;

  const extra: Record<string, unknown> = {};
  if (list.archetype === "goal_queue") {
    const pillar = plainSelect(properties.Pillar);
    if (pillar) {
      const reverse: Record<string, string> = {
        "🏃 Health": "health",
        "💰 Wealth": "wealth",
        "📚 Wisdom": "wisdom",
        "🌟 Joy": "joy",
      };
      extra.pillar = reverse[pillar] ?? pillar;
    }
  }

  if (list.archetype === "checkin_log") {
    for (const key of [
      "Day Rating",
      "Health Score",
      "Wealth Score",
      "Wisdom Score",
      "Joy Score",
      "How Are You Feeling",
      "Pattern Flags",
    ]) {
      const p = properties[key];
      const sel = plainSelect(p);
      const txt = plainText(p);
      const num = p?.type === "number" ? p.number : undefined;
      const val = sel ?? (num != null ? String(num) : txt);
      if (val) {
        extra[key] = val;
      }
    }
  }

  return {
    title,
    status: status ?? list.default_status ?? undefined,
    notes,
    url,
    author,
    priority,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
