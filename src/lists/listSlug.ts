/**
 * Resolve user-facing list names to canonical slugs.
 */
import { isStandardSlug } from "./listCatalog.js";

const SLUG_ALIASES: Record<string, string> = {
  watchlist: "watchlist",
  watch: "watchlist",
  film: "watchlist",
  movie: "watchlist",
  movies: "watchlist",
  readlist: "readlist",
  read: "readlist",
  book: "readlist",
  books: "readlist",
  travel: "travel",
  trip: "travel",
  food: "food",
  restaurant: "food",
  music: "music",
  song: "music",
  tasks: "tasks",
  todo: "tasks",
  todos: "tasks",
  goals: "goals",
  goal: "goals",
  patterns: "patterns",
  pattern: "patterns",
  experiences: "experiences",
  experience: "experiences",
  checkins: "checkins",
  checkin: "checkins",
  "check-in": "checkins",
  "check-ins": "checkins",
  "magnus-ideas": "magnus-ideas",
  "magnus ideas": "magnus-ideas",
  guitar: "music",
};

const SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,48}$/;

export function normalizeSlug(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const aliased = SLUG_ALIASES[trimmed] ?? trimmed.replace(/\s+/g, "-");
  if (!SLUG_PATTERN.test(aliased)) {
    return null;
  }
  return aliased;
}

export function isValidCustomSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !slug.startsWith("_");
}

export function describeUnknownList(input: string): string {
  return `Unknown list "${input}". Say list_catalog to see yours, or create_list for a custom slug. Standard slugs: watchlist, readlist, travel, food, music, tasks, goals, patterns, experiences, checkins.`;
}

export function slugKindHint(slug: string): "standard" | "custom" {
  return isStandardSlug(slug) ? "standard" : "custom";
}
