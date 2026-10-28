/**
 * Resolve user-facing list names to canonical slugs.
 */
import { isStandardSlug } from "./listCatalog.js";

const SLUG_ALIASES: Record<string, string> = {
  watchlist: "watchlist",
  watch: "watchlist",
  watching: "watchlist",
  film: "watchlist",
  films: "watchlist",
  movie: "watchlist",
  movies: "watchlist",
  show: "watchlist",
  shows: "watchlist",
  series: "watchlist",
  readlist: "readlist",
  read: "readlist",
  reading: "readlist",
  book: "readlist",
  books: "readlist",
  travel: "travel",
  trip: "travel",
  trips: "travel",
  holiday: "travel",
  holidays: "travel",
  vacation: "travel",
  food: "food",
  restaurant: "food",
  restaurants: "food",
  music: "music",
  song: "music",
  songs: "music",
  album: "music",
  albums: "music",
  tasks: "tasks",
  task: "tasks",
  todo: "tasks",
  todos: "tasks",
  "to-do": "tasks",
  "to-dos": "tasks",
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
};

const SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,48}$/;

/** Words people put around a list name that carry no meaning for resolution. */
const LEADING_FILLER = new Set(["my", "the", "our", "a", "an", "this"]);
const TRAILING_FILLER = new Set(["list", "lists"]);

function words(input: string): string[] {
  return input
    .replace(/[^a-z0-9\s_-]+/g, " ")
    .split(/[\s_]+/)
    .filter(Boolean);
}

/**
 * Strip the packaging humans wrap a list name in: "my todo list" is the todo list,
 * "the reading list" is the reading list. Keeps stripping so "my to-do list please"
 * still lands on `tasks`.
 */
function stripFiller(parts: string[]): string[] {
  let out = [...parts];
  while (out.length > 1 && LEADING_FILLER.has(out[0]!)) {
    out = out.slice(1);
  }
  while (out.length > 1 && TRAILING_FILLER.has(out[out.length - 1]!)) {
    out = out.slice(0, -1);
  }
  return out;
}

export function normalizeSlug(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  if (!lower) {
    return null;
  }

  const direct = SLUG_ALIASES[lower];
  if (direct) {
    return direct;
  }

  const parts = words(lower);
  if (parts.length === 0) {
    return null;
  }

  // "watch list" and "watchlist" are the same request typed two ways.
  const joined = SLUG_ALIASES[parts.join("")];
  if (joined) {
    return joined;
  }

  const core = stripFiller(parts);
  const coreKey = core.join(" ");
  const coreAlias = SLUG_ALIASES[coreKey] ?? SLUG_ALIASES[core.join("-")] ?? SLUG_ALIASES[core.join("")];
  if (coreAlias) {
    return coreAlias;
  }

  const candidate = core.join("-");
  if (!SLUG_PATTERN.test(candidate)) {
    return null;
  }
  return candidate;
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

/**
 * Second chance when the normalized slug is not a row the user owns: match against
 * their real catalog by slug and display name, so "grocery" finds "groceries" and
 * "Holiday prep" finds `holiday-prep` without the user having to know the slug.
 */
export function matchListByName<T extends { slug: string; display_name: string }>(
  lists: T[],
  raw: string,
): T | null {
  const target = stripFiller(words(raw.trim().toLowerCase()));
  if (target.length === 0) {
    return null;
  }
  const key = target.join("");
  const singular = (value: string): string => value.replace(/(?:ies|es|s)$/, "");
  const keyStem = singular(key);

  const scored = lists
    .map((list) => {
      const slugKey = list.slug.replace(/[-_]/g, "");
      const nameKey = stripFiller(words(list.display_name.toLowerCase())).join("");
      if (slugKey === key || nameKey === key) {
        return { list, score: 3 };
      }
      if (singular(slugKey) === keyStem || singular(nameKey) === keyStem) {
        return { list, score: 2 };
      }
      if (keyStem.length >= 4 && (slugKey.startsWith(keyStem) || nameKey.startsWith(keyStem))) {
        return { list, score: 1 };
      }
      return { list, score: 0 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.list ?? null;
}
