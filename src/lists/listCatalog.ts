/**
 * Standard list templates shipped for every user. No Notion ids — those are per-user only.
 */
export type ListArchetype =
  | "media_queue"
  | "reading_queue"
  | "place_queue"
  | "food_queue"
  | "music_queue"
  | "task_queue"
  | "goal_queue"
  | "experience_queue"
  | "pattern_log"
  | "checkin_log"
  | "generic_queue";

export type ListTemplate = {
  slug: string;
  displayName: string;
  archetype: ListArchetype;
  description: string;
  pillar?: string;
  defaultStatus?: string;
  openStatuses: string[];
  notionTitleProperty: string;
  notionStatusProperty?: string;
  notionStatusKind: "select" | "status";
};

/** Slugs every user receives on first list access. Custom slugs are allowed on top. */
export const STANDARD_LIST_TEMPLATES: readonly ListTemplate[] = [
  {
    slug: "watchlist",
    displayName: "Watchlist",
    archetype: "media_queue",
    description: "Films and shows to watch",
    pillar: "happiness",
    defaultStatus: "Want to Watch",
    openStatuses: ["Want to Watch", "Watching"],
    notionTitleProperty: "Title",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "readlist",
    displayName: "Reading list",
    archetype: "reading_queue",
    description: "Books and articles to read",
    pillar: "happiness",
    defaultStatus: "Want to Read",
    openStatuses: ["Want to Read", "Reading"],
    notionTitleProperty: "Title",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "travel",
    displayName: "Travel wishlist",
    archetype: "place_queue",
    description: "Places to visit",
    pillar: "happiness",
    defaultStatus: "Dream",
    openStatuses: ["Dream", "Planning", "Booked"],
    notionTitleProperty: "Destination",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "food",
    displayName: "Food wishlist",
    archetype: "food_queue",
    description: "Restaurants and dishes to try",
    pillar: "happiness",
    defaultStatus: "Want to Try",
    openStatuses: ["Want to Try"],
    notionTitleProperty: "Item",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "music",
    displayName: "Music list",
    archetype: "music_queue",
    description: "Albums, artists, and tracks to explore",
    pillar: "happiness",
    defaultStatus: "Want to Listen",
    openStatuses: ["Want to Listen", "Listening"],
    notionTitleProperty: "Title",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "tasks",
    displayName: "Life tasks",
    archetype: "task_queue",
    description: "Open loops and personal todos",
    defaultStatus: "Not started",
    openStatuses: ["Not started", "In progress"],
    notionTitleProperty: "Task name",
    notionStatusProperty: "Status",
    notionStatusKind: "status",
  },
  {
    slug: "goals",
    displayName: "Goals",
    archetype: "goal_queue",
    description: "Goals and milestones across pillars",
    defaultStatus: "Not Started",
    openStatuses: ["Not Started", "In Progress", "On Track", "Behind"],
    notionTitleProperty: "Goal Name",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "patterns",
    displayName: "Patterns",
    archetype: "pattern_log",
    description: "Recurring life patterns to monitor",
    defaultStatus: "Monitoring",
    openStatuses: ["Monitoring", "Confirmed"],
    notionTitleProperty: "Pattern",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "experiences",
    displayName: "Experiences",
    archetype: "experience_queue",
    description: "Events, hobbies, and joy activities to try",
    pillar: "happiness",
    defaultStatus: "Suggested",
    openStatuses: ["Suggested", "Planned", "In progress"],
    notionTitleProperty: "Title",
    notionStatusProperty: "Status",
    notionStatusKind: "select",
  },
  {
    slug: "checkins",
    displayName: "Daily check-ins",
    archetype: "checkin_log",
    description: "Evening pillar scores and reflection",
    notionTitleProperty: "Date",
    openStatuses: [],
    notionStatusKind: "select",
  },
] as const;

export function getStandardTemplate(slug: string): ListTemplate | undefined {
  return STANDARD_LIST_TEMPLATES.find((t) => t.slug === slug);
}

export function isStandardSlug(slug: string): boolean {
  return STANDARD_LIST_TEMPLATES.some((t) => t.slug === slug);
}
