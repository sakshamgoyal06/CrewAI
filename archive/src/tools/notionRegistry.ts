/**
 * Per-user Notion database registry — loaded from user_integrations only.
 * No app-level or owner defaults at runtime.
 */
import { loadUserIntegrations } from "../users/userIntegrations.js";

/** Standard list slugs that may appear in notion_registry.lists */
export type NotionListKind =
  | "watchlist"
  | "readlist"
  | "travel"
  | "food"
  | "music"
  | "tasks"
  | "goals"
  | "checkins"
  | "patterns"
  | "experiences";

export type NotionListConfig = {
  dataSourceId: string;
  titleProperty: string;
  statusProperty?: string;
  defaultStatus?: string;
  openStatuses?: string[];
};

export type NotionRegistry = {
  hubPageId?: string;
  lists: Partial<Record<NotionListKind | string, NotionListConfig>>;
};

export { normalizeSlug as normalizeListKind } from "../lists/listSlug.js";

function emptyRegistry(): NotionRegistry {
  return { lists: {} };
}

function mergeRegistry(base: NotionRegistry, override?: NotionRegistry | null): NotionRegistry {
  if (!override) {
    return base;
  }
  return {
    hubPageId: override.hubPageId ?? base.hubPageId,
    lists: { ...base.lists, ...override.lists },
  };
}

/** Load the user's Notion registry — never falls back to another user's ids. */
export async function loadNotionRegistry(userProfileId: string): Promise<NotionRegistry> {
  const integrations = await loadUserIntegrations(userProfileId);
  const fromDb = integrations.notionRegistry as NotionRegistry | undefined;

  const legacy: NotionRegistry = { lists: {} };
  if (integrations.notionGoalsDatabaseId) {
    legacy.lists!.goals = {
      dataSourceId: integrations.notionGoalsDatabaseId,
      titleProperty: "Goal Name",
      statusProperty: "Status",
      defaultStatus: "Not Started",
      openStatuses: ["Not Started", "In Progress", "On Track", "Behind"],
    };
  }
  if (integrations.notionDailyCheckinsDatabaseId) {
    legacy.lists!.checkins = {
      dataSourceId: integrations.notionDailyCheckinsDatabaseId,
      titleProperty: "Date",
    };
  }

  return mergeRegistry(mergeRegistry(emptyRegistry(), legacy), fromDb ?? null);
}

export function getListConfig(
  registry: NotionRegistry,
  kind: NotionListKind | string,
): NotionListConfig | null {
  return registry.lists[kind] ?? null;
}

/**
 * Owner workspace reference for audit scripts only — not used at runtime.
 * See scripts/audit-notion-lifeos.mts
 */
export const OWNER_NOTION_REGISTRY_REFERENCE: NotionRegistry = {
  hubPageId: "32cb455a-f233-811b-9e29-fcd84f710759",
  lists: {
    goals: {
      dataSourceId: "e2e49bc5-895c-49e5-b123-9987b08e07b4",
      titleProperty: "Goal Name",
      statusProperty: "Status",
      defaultStatus: "Not Started",
      openStatuses: ["Not Started", "In Progress", "On Track", "Behind"],
    },
    checkins: {
      dataSourceId: "d1f11c72-e1e2-4436-a70f-d15de6b02bd0",
      titleProperty: "Date",
    },
    patterns: {
      dataSourceId: "6c05559d-d4e2-47aa-b0a2-0a52e7d95488",
      titleProperty: "Pattern",
      statusProperty: "Status",
      openStatuses: ["Monitoring", "Confirmed"],
    },
    watchlist: {
      dataSourceId: "940a88ca-0d52-4d7a-81e3-eb59c8c116ee",
      titleProperty: "Title",
      statusProperty: "Status",
      defaultStatus: "Want to Watch",
      openStatuses: ["Want to Watch", "Watching"],
    },
    readlist: {
      dataSourceId: "3016f5f4-9ae3-47be-89f7-7ad5dcfbe66c",
      titleProperty: "Title",
      statusProperty: "Status",
      defaultStatus: "Want to Read",
      openStatuses: ["Want to Read", "Reading"],
    },
    travel: {
      dataSourceId: "47c97d19-61a4-49eb-a718-ca93d09c7f42",
      titleProperty: "Destination",
      statusProperty: "Status",
      defaultStatus: "Dream",
      openStatuses: ["Dream", "Planning", "Booked"],
    },
    food: {
      dataSourceId: "73463cb8-0d4e-4879-a8ee-c4c8fd8f3605",
      titleProperty: "Item",
      statusProperty: "Status",
      defaultStatus: "Want to Try",
      openStatuses: ["Want to Try"],
    },
    music: {
      dataSourceId: "f12bc06d-7e49-4a28-8edd-7716f47d1dd4",
      titleProperty: "Title",
      statusProperty: "Status",
      defaultStatus: "Want to Listen",
      openStatuses: ["Want to Listen", "Listening"],
    },
    tasks: {
      dataSourceId: "3531df8a-2472-453d-9c83-113026de956f",
      titleProperty: "Task name",
      statusProperty: "Status",
      defaultStatus: "Not started",
      openStatuses: ["Not started", "In progress"],
    },
  },
};
