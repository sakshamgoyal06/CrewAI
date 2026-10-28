/**
 * Stale open-list items for proactive nudges ("you queued 3 films — pick one?").
 */
import { ensureUserLists } from "../../lists/listService.js";
import { queryListItems } from "../../lists/listStore.js";

export const NUDGEABLE_LIST_SLUGS = [
  "watchlist",
  "readlist",
  "music",
  "travel",
  "food",
  "experiences",
] as const;

export type StaleListItem = {
  slug: string;
  displayName: string;
  title: string;
  status: string | null;
  daysSinceUpdate: number;
};

export type StaleListSnapshot = {
  staleItems: StaleListItem[];
  totalStale: number;
  bySlug: Record<string, number>;
};

function daysBetween(older: Date, now: Date): number {
  const ms = now.getTime() - older.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export async function loadStaleListSnapshot(input: {
  userProfileId: string;
  now: Date;
  staleDays?: number;
  listSlugs?: readonly string[];
}): Promise<StaleListSnapshot> {
  const staleDays = Math.max(1, input.staleDays ?? 14);
  const targetSlugs = new Set(input.listSlugs ?? NUDGEABLE_LIST_SLUGS);
  const lists = await ensureUserLists(input.userProfileId);
  const staleItems: StaleListItem[] = [];
  const bySlug: Record<string, number> = {};

  for (const list of lists) {
    if (!targetSlugs.has(list.slug) || list.open_statuses.length === 0) {
      continue;
    }

    const items = await queryListItems({
      userProfileId: input.userProfileId,
      listId: list.id,
      openStatuses: list.open_statuses,
      limit: 30,
    });

    if (!items.ok) {
      continue;
    }

    for (const item of items.data) {
      const updated = new Date(item.updated_at);
      if (Number.isNaN(updated.getTime())) {
        continue;
      }
      const days = daysBetween(updated, input.now);
      if (days < staleDays) {
        continue;
      }
      staleItems.push({
        slug: list.slug,
        displayName: list.display_name,
        title: item.title,
        status: item.status,
        daysSinceUpdate: days,
      });
      bySlug[list.slug] = (bySlug[list.slug] ?? 0) + 1;
    }
  }

  return {
    staleItems: staleItems.slice(0, 12),
    totalStale: staleItems.length,
    bySlug,
  };
}

export function formatStaleListSummary(snapshot: StaleListSnapshot): string {
  if (snapshot.totalStale === 0) {
    return "";
  }
  const slugSummary = Object.entries(snapshot.bySlug)
    .map(([slug, count]) => `${slug}: ${count}`)
    .join(", ");
  const samples = snapshot.staleItems
    .slice(0, 5)
    .map((i) => `- ${i.slug}: ${i.title} (${i.daysSinceUpdate}d idle)`)
    .join("\n");
  return [`Stale open items (${snapshot.totalStale}): ${slugSummary}`, samples].join("\n");
}
