/**
 * List context for Magnus memory — catalog summary and open-item highlights.
 */
import { loadUserIntegrations } from "../users/userIntegrations.js";
import { ensureUserLists } from "./listService.js";
import { queryListItems } from "./listStore.js";

export type ListMemoryCatalogEntry = {
  slug: string;
  displayName: string;
  openCount: number;
  notionLinked: boolean;
};

export type ListMemoryHighlight = {
  slug: string;
  title: string;
  status?: string;
};

export type ListMemoryContext = {
  notionConnected: boolean;
  catalog: ListMemoryCatalogEntry[];
  openHighlights: ListMemoryHighlight[];
};

const HIGHLIGHT_SLUGS = ["watchlist", "readlist", "tasks", "music", "travel", "goals"] as const;

export async function loadListMemoryContext(userProfileId: string): Promise<ListMemoryContext> {
  const integrations = await loadUserIntegrations(userProfileId);
  const lists = await ensureUserLists(userProfileId);

  const catalog: ListMemoryCatalogEntry[] = [];
  const openHighlights: ListMemoryHighlight[] = [];

  for (const list of lists) {
    const items = await queryListItems({
      userProfileId,
      listId: list.id,
      openStatuses: list.open_statuses.length > 0 ? list.open_statuses : undefined,
      limit: 50,
    });

    const openCount = items.ok ? items.data.length : 0;
    catalog.push({
      slug: list.slug,
      displayName: list.display_name,
      openCount,
      notionLinked: Boolean(list.notion_data_source_id),
    });

    if (
      (HIGHLIGHT_SLUGS as readonly string[]).includes(list.slug) &&
      items.ok &&
      items.data.length > 0
    ) {
      for (const item of items.data.slice(0, 3)) {
        openHighlights.push({
          slug: list.slug,
          title: item.title,
          status: item.status ?? undefined,
        });
      }
    }
  }

  return {
    notionConnected: Boolean(integrations.notionToken),
    catalog,
    openHighlights,
  };
}

export function formatListMemoryBlock(ctx: ListMemoryContext): string {
  const parts: string[] = [];

  parts.push(
    `Notion: ${ctx.notionConnected ? "connected (optional mirror)" : "not connected — lists are Supabase-only"}`,
  );

  const withOpen = ctx.catalog.filter((c) => c.openCount > 0);
  if (withOpen.length > 0) {
    const lines = withOpen
      .slice(0, 12)
      .map(
        (c) =>
          `- ${c.slug} (${c.openCount} open${c.notionLinked ? ", notion linked" : ""})`,
      );
    parts.push(`List catalog (open counts):\n${lines.join("\n")}`);
  } else {
    const slugs = ctx.catalog.map((c) => c.slug).join(", ");
    parts.push(`List slugs available: ${slugs || "(none yet)"}`);
  }

  if (ctx.openHighlights.length > 0) {
    const lines = ctx.openHighlights.slice(0, 12).map((h) => {
      const st = h.status ? ` [${h.status}]` : "";
      return `- ${h.slug}: ${h.title}${st}`;
    });
    parts.push(`Open list highlights (use list_items for full rows):\n${lines.join("\n")}`);
  }

  parts.push(
    "When recommending from lists, call list_items with open_only=true — do not invent items.",
  );

  return parts.join("\n\n");
}
