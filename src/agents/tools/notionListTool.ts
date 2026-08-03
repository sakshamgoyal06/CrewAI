/**
 * Magnus tools for LifeOS Notion lists (watchlist, readlist, travel, tasks, etc.).
 */
import {
  addNotionGoal,
  addNotionItem,
  getNotionCheckin,
  listNotionItems,
  updateNotionItem,
} from "../../tools/notionLists.js";
import { normalizeListKind } from "../../tools/notionListKinds.js";

export async function notionListItems(input: {
  userProfileId: string;
  list: string;
  status?: string;
  openOnly?: boolean;
  limit?: number;
}): Promise<string> {
  const kind = normalizeListKind(input.list);
  if (!kind) {
    return `Unknown list "${input.list}". Try: watchlist, readlist, travel, food, music, tasks, goals, patterns.`;
  }
  return listNotionItems({
    userProfileId: input.userProfileId,
    list: kind,
    status: input.status,
    openOnly: input.openOnly ?? false,
    limit: input.limit,
  });
}

export async function notionAddItem(input: {
  userProfileId: string;
  list: string;
  title: string;
  status?: string;
  notes?: string;
  url?: string;
  author?: string;
  priority?: string;
}): Promise<string> {
  const kind = normalizeListKind(input.list);
  if (!kind) {
    return `Unknown list "${input.list}".`;
  }
  return addNotionItem({
    userProfileId: input.userProfileId,
    list: kind,
    title: input.title,
    status: input.status,
    notes: input.notes,
    url: input.url,
    author: input.author,
    priority: input.priority,
  });
}

export async function notionUpdateItem(input: {
  userProfileId: string;
  list: string;
  pageId: string;
  status?: string;
  notes?: string;
  title?: string;
}): Promise<string> {
  const kind = normalizeListKind(input.list);
  if (!kind) {
    return `Unknown list "${input.list}".`;
  }
  return updateNotionItem({
    userProfileId: input.userProfileId,
    list: kind,
    pageId: input.pageId,
    status: input.status,
    notes: input.notes,
    title: input.title,
  });
}

export { getNotionCheckin, addNotionGoal };
