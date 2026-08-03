/**
 * LifeOS Notion database registry — defaults from the workspace hub, overridable per user.
 */
import { loadUserIntegrations } from "../users/userIntegrations.js";

import type { NotionListKind } from "./notionListKinds.js";
export type { NotionListKind } from "./notionListKinds.js";
export { normalizeListKind } from "./notionListKinds.js";

export type NotionListConfig = {
  dataSourceId: string;
  titleProperty: string;
  statusProperty?: string;
  defaultStatus?: string;
  /** Status values treated as open / queued when filtering recommendations. */
  openStatuses?: string[];
};

export type NotionRegistry = {
  hubPageId?: string;
  lists: Partial<Record<NotionListKind, NotionListConfig>>;
};

/** Canonical LifeOS hub registry (Aug 2026). */
export const DEFAULT_NOTION_REGISTRY: NotionRegistry = {
  hubPageId: "32cb455a-f233-811b-9e29-fcd84f710759",
  lists: {
    goals: {
      dataSourceId: "29414966-cd2f-4f56-9933-ccf0010933d8",
      titleProperty: "Goal Name",
      statusProperty: "Status",
      defaultStatus: "Not Started",
      openStatuses: ["Not Started", "In Progress", "On Track", "Behind"],
    },
    checkins: {
      dataSourceId: "418daa9b-ff95-4947-925a-e53d9b3a59c6",
      titleProperty: "Date",
    },
    patterns: {
      dataSourceId: "211a6cfd-9075-4aca-92ae-7809d79186a8",
      titleProperty: "Pattern",
      statusProperty: "Status",
      openStatuses: ["Monitoring", "Confirmed"],
    },
    watchlist: {
      dataSourceId: "26368f0c-5991-4bf1-a1b0-e702a2c3de7a",
      titleProperty: "Title",
      statusProperty: "Status",
      defaultStatus: "Want to Watch",
      openStatuses: ["Want to Watch", "Watching"],
    },
    readlist: {
      dataSourceId: "c8a178a5-9e21-4cca-99e4-ec303b1365df",
      titleProperty: "Title",
      statusProperty: "Status",
      defaultStatus: "Want to Read",
      openStatuses: ["Want to Read", "Reading"],
    },
    travel: {
      dataSourceId: "596ab223-1df0-4d3e-85ee-e542b6bb5652",
      titleProperty: "Destination",
      statusProperty: "Status",
      defaultStatus: "Dream",
      openStatuses: ["Dream", "Planning", "Booked"],
    },
    food: {
      dataSourceId: "6a120f77-b45f-4497-b993-74c3cd24c600",
      titleProperty: "Item",
      statusProperty: "Status",
      defaultStatus: "Want to Try",
      openStatuses: ["Want to Try"],
    },
    music: {
      dataSourceId: "a284eca4-f036-4c2c-bd03-9b5b647d33ef",
      titleProperty: "Title",
      statusProperty: "Status",
      defaultStatus: "Want to Listen",
      openStatuses: ["Want to Listen", "Listening"],
    },
    tasks: {
      dataSourceId: "8cb24979-1f75-4831-a9a6-1556870db217",
      titleProperty: "Task name",
      statusProperty: "Status",
      defaultStatus: "Not started",
      openStatuses: ["Not started", "In progress"],
    },
  },
};

function mergeRegistry(base: NotionRegistry, override?: NotionRegistry | null): NotionRegistry {
  if (!override) {
    return base;
  }
  return {
    hubPageId: override.hubPageId ?? base.hubPageId,
    lists: { ...base.lists, ...override.lists },
  };
}

export async function loadNotionRegistry(userProfileId: string): Promise<NotionRegistry> {
  const integrations = await loadUserIntegrations(userProfileId);
  const fromDb = integrations.notionRegistry as NotionRegistry | undefined;

  const legacy: NotionRegistry = { lists: {} };
  if (integrations.notionGoalsDatabaseId) {
    legacy.lists!.goals = {
      ...DEFAULT_NOTION_REGISTRY.lists.goals!,
      dataSourceId: integrations.notionGoalsDatabaseId,
    };
  }
  if (integrations.notionDailyCheckinsDatabaseId) {
    legacy.lists!.checkins = {
      ...DEFAULT_NOTION_REGISTRY.lists.checkins!,
      dataSourceId: integrations.notionDailyCheckinsDatabaseId,
    };
  }

  return mergeRegistry(
    mergeRegistry(DEFAULT_NOTION_REGISTRY, legacy),
    fromDb ?? null,
  );
}

export function getListConfig(
  registry: NotionRegistry,
  kind: NotionListKind,
): NotionListConfig | null {
  return registry.lists[kind] ?? null;
}
