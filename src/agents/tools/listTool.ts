/**
 * Magnus tools for user-agnostic lists (Supabase canonical, optional Notion mirror).
 */
import {
  addGoal,
  addListItem,
  createCustomList,
  getDailyCheckin,
  linkNotionList,
  listCatalog,
  listItems,
  logDailyCheckin,
  recommendListItems,
  updateListItemCompat,
} from "../../lists/listService.js";
import { normalizeSlug, describeUnknownList } from "../../lists/listSlug.js";
import type { ListArchetype } from "../../lists/listCatalog.js";

export async function magnusListItems(input: {
  userProfileId: string;
  list: string;
  status?: string;
  openOnly?: boolean;
  limit?: number;
}): Promise<string> {
  return listItems({
    userProfileId: input.userProfileId,
    list: input.list,
    status: input.status,
    openOnly: input.openOnly ?? false,
    limit: input.limit,
  });
}

export async function magnusAddListItem(input: {
  userProfileId: string;
  list: string;
  title: string;
  status?: string;
  notes?: string;
  url?: string;
  author?: string;
  priority?: string;
  pillar?: string;
}): Promise<string> {
  return addListItem(input);
}

export async function magnusUpdateListItem(input: {
  userProfileId: string;
  list: string;
  itemId: string;
  status?: string;
  notes?: string;
  title?: string;
}): Promise<string> {
  return updateListItemCompat({
    userProfileId: input.userProfileId,
    list: input.list,
    itemId: input.itemId,
    status: input.status,
    notes: input.notes,
    title: input.title,
  });
}

export async function magnusListCatalog(input: { userProfileId: string }): Promise<string> {
  return listCatalog(input.userProfileId);
}

export async function magnusCreateList(input: {
  userProfileId: string;
  slug: string;
  displayName: string;
  archetype?: string;
  description?: string;
  pillar?: string;
}): Promise<string> {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    return describeUnknownList(input.slug);
  }

  const archetypes: ListArchetype[] = [
    "generic_queue",
    "media_queue",
    "reading_queue",
    "place_queue",
    "food_queue",
    "music_queue",
    "task_queue",
    "goal_queue",
    "experience_queue",
    "pattern_log",
  ];
  const archetype = archetypes.includes(input.archetype as ListArchetype)
    ? (input.archetype as ListArchetype)
    : undefined;

  return createCustomList({
    userProfileId: input.userProfileId,
    slug,
    displayName: input.displayName,
    archetype,
    description: input.description,
    pillar: input.pillar,
  });
}

export async function magnusLinkNotionList(input: {
  userProfileId: string;
  slug: string;
  notionDatabaseId: string;
  titleProperty?: string;
  statusProperty?: string;
  statusKind?: "select" | "status";
}): Promise<string> {
  return linkNotionList(input);
}

export async function magnusRecommendListItems(input: {
  userProfileId: string;
  list: string;
  genre?: string;
  language?: string;
  minRating?: number;
  maxRuntimeMinutes?: number;
  openOnly?: boolean;
  query?: string;
  limit?: number;
}): Promise<string> {
  return recommendListItems(input);
}

export { getDailyCheckin, logDailyCheckin, addGoal };

// Backward-compatible aliases for prior tool names
export const notionListItems = magnusListItems;
export const notionAddItem = magnusAddListItem;
export const notionUpdateItem = magnusUpdateListItem;
export const getNotionCheckin = getDailyCheckin;
export const addNotionGoal = addGoal;
