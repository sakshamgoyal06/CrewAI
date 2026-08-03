export type NotionListKind =
  | "watchlist"
  | "readlist"
  | "travel"
  | "food"
  | "music"
  | "tasks"
  | "goals"
  | "checkins"
  | "patterns";

const LIST_ALIASES: Record<string, NotionListKind> = {
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
};

export function normalizeListKind(raw: string): NotionListKind | null {
  const key = raw.trim().toLowerCase();
  return LIST_ALIASES[key] ?? null;
}
