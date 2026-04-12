/**
 * Server-side Notion API — used by Magnus agents when running headless (Telegram bot).
 * Cursor MCP is IDE-only; this module uses NOTION_TOKEN + @notionhq/client.
 */
import { APIErrorCode, Client, isNotionClientError } from "@notionhq/client";

import { logger } from "../logger.js";

const log = logger.child({ module: "notion" });

type ChildPageBlock = { id: string; child_page: { title: string } };

function parseChildPageBlock(block: unknown): ChildPageBlock | null {
  if (typeof block !== "object" || block === null) {
    return null;
  }
  const o = block as Record<string, unknown>;
  if (o.type !== "child_page" || typeof o.id !== "string") {
    return null;
  }
  const cp = o.child_page;
  if (typeof cp !== "object" || cp === null || typeof (cp as { title?: unknown }).title !== "string") {
    return null;
  }
  return {
    id: o.id,
    child_page: { title: (cp as { title: string }).title },
  };
}

/** Resolve integration secret (never log the value). */
export function getNotionToken(): string | undefined {
  const t =
    process.env.NOTION_TOKEN?.trim() ||
    process.env.NOTION_API_KEY?.trim() ||
    process.env.NOTION_INTEGRATION_TOKEN?.trim();
  return t || undefined;
}

export function notionDatabaseIdGoals(): string | undefined {
  return process.env.NOTION_GOALS_DATABASE_ID?.trim();
}

export function notionDatabaseIdDailyCheckins(): string | undefined {
  return process.env.NOTION_DAILY_CHECKINS_DATABASE_ID?.trim();
}

export function notionDatabaseIdPatterns(): string | undefined {
  return process.env.NOTION_PATTERNS_DATABASE_ID?.trim();
}

/** Parent page for dated ritual pages (Morning Brief, weekly review, Magnus log). */
export function notionDailyLogParentPageId(): string | undefined {
  return process.env.NOTION_DAILY_LOG_PARENT_PAGE_ID?.trim();
}

export function notionCheckinDateProperty(): string {
  return process.env.NOTION_CHECKIN_DATE_PROPERTY?.trim() || "Date";
}

export function notionGoalsTitleProperty(): string {
  return process.env.NOTION_GOALS_TITLE_PROPERTY?.trim() || "Name";
}

/** Title property name for pages created under a parent page (workspace default is often "title"). */
export function notionPageTitlePropertyName(): string {
  return process.env.NOTION_PAGE_TITLE_PROPERTY?.trim() || "title";
}

export function notionLogTitlePrefix(): string {
  return process.env.NOTION_LOG_TITLE_PREFIX?.trim() || "Magnus Log";
}

export function createNotionClient(token?: string): Client | null {
  const auth = token ?? getNotionToken();
  if (!auth) {
    return null;
  }
  return new Client({
    auth,
    notionVersion: "2022-06-28",
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNotionError(err: unknown): boolean {
  if (!isNotionClientError(err)) {
    return false;
  }
  if (err.code === APIErrorCode.RateLimited) {
    return true;
  }
  if (err.code === APIErrorCode.ServiceUnavailable) {
    return true;
  }
  if ("status" in err && typeof err.status === "number") {
    return err.status === 429 || err.status === 503;
  }
  return false;
}

/**
 * Retry wrapper for transient Notion errors (rate limit, service unavailable).
 * Does not log request bodies or tokens.
 */
export async function withNotionRetry<T>(
  op: string,
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableNotionError(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      const backoffMs = Math.min(1000 * 2 ** attempt, 16_000);
      log.warn(
        { op, attempt: attempt + 1, backoffMs, err: String(err) },
        "notion retry",
      );
      await sleep(backoffMs);
    }
  }
  throw lastErr;
}

/**
 * List direct child **page** blocks under a block/page id (paginated).
 */
export async function listAllChildBlocks(
  client: Client,
  blockId: string,
): Promise<ChildPageBlock[]> {
  const out: ChildPageBlock[] = [];
  let cursor: string | undefined;
  do {
    const res = await withNotionRetry("blocks.children.list", () =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );
    for (const block of res.results) {
      const parsed = parseChildPageBlock(block);
      if (parsed) {
        out.push(parsed);
      }
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

export type EnsurePageForDateResult = {
  pageId: string;
  created: boolean;
  title: string;
};

/**
 * Find or create a child page under `parentPageId` titled `titlePrefix — YYYY-MM-DD` (local date in `timeZone`).
 */
export async function ensurePageForDate(
  client: Client,
  parentPageId: string,
  date: Date,
  timeZone: string | undefined,
  titlePrefix: string,
  titlePropertyName: string,
): Promise<EnsurePageForDateResult> {
  const tz = timeZone?.trim() || "UTC";
  const dateKey = formatDateKeyInTimeZone(date, tz);
  const fullTitle = `${titlePrefix} — ${dateKey}`;

  const blocks = await listAllChildBlocks(client, parentPageId);
  for (const b of blocks) {
    if (b.child_page.title.trim() === fullTitle) {
      return { pageId: b.id, created: false, title: fullTitle };
    }
  }

  const created = await withNotionRetry("pages.create", () =>
    client.pages.create({
      parent: { page_id: parentPageId },
      properties: {
        [titlePropertyName]: {
          title: [{ type: "text", text: { content: fullTitle } }],
        },
      },
    }),
  );

  return { pageId: created.id, created: true, title: fullTitle };
}

export function formatDateKeyInTimeZone(date: Date, timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) {
      return `${y}-${m}-${d}`;
    }
  } catch {
    // fall through
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Append one or more paragraph blocks to a page.
 */
export async function appendParagraphBlocks(
  client: Client,
  pageId: string,
  paragraphs: string[],
): Promise<void> {
  const children = paragraphs.map((text) => ({
    type: "paragraph" as const,
    paragraph: {
      rich_text: [{ type: "text" as const, text: { content: text.slice(0, 2000) } }],
    },
  }));
  await withNotionRetry("blocks.children.append", () =>
    client.blocks.children.append({
      block_id: pageId,
      children,
    }),
  );
}

export type CheckInQueryResult = {
  pageIds: string[];
  rawCount: number;
};

/**
 * Query a database for rows whose date property equals `dateKey` (YYYY-MM-DD).
 */
export async function queryDatabaseByDateProperty(
  client: Client,
  databaseId: string,
  datePropertyName: string,
  dateKey: string,
): Promise<CheckInQueryResult> {
  const res = await withNotionRetry("databases.query", () =>
    client.databases.query({
      database_id: databaseId,
      filter: {
        property: datePropertyName,
        date: { equals: dateKey },
      },
    }),
  );
  const pageIds = res.results.map((p) => p.id);
  return { pageIds, rawCount: res.results.length };
}

/**
 * Create a new row in a task/goals database with a title only (minimal write path).
 */
export async function createGoalPage(
  client: Client,
  databaseId: string,
  titlePropertyName: string,
  title: string,
): Promise<{ pageId: string }> {
  const page = await withNotionRetry("pages.create.goal", () =>
    client.pages.create({
      parent: { database_id: databaseId },
      properties: {
        [titlePropertyName]: {
          title: [{ type: "text", text: { content: title.slice(0, 2000) } }],
        },
      },
    }),
  );
  return { pageId: page.id };
}
