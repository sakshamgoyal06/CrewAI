/**
 * Minimal Magnus — production scope fence while core operations are perfected.
 *
 * **Phase 1 focus** (see `docs/product/MINIMAL_MODE_FOCUS.md`): workouts, calendar, lists,
 * reminders, and logging — plus plan-adherence closure (activity completion, gym ↔ Hevy,
 * evening journal). **Meals come in Phase 2** after these paths are solid.
 *
 * Supporting (live but not a focus pillar): YouTube, morning brief, conversation.
 * Parks: meals, Notion, LifeOS, projects, wealth/happiness/wisdom depth, vision/photos,
 * nutrition nightly, and non-core proactive rhythm kinds.
 *
 * Set MAGNUS_MINIMAL_MODE=false on the host to restore full Magnus.
 */
import type { ParkedFeatureTopic } from "../agents/routing/routingContextParser.js";
import type { Intent } from "../intent.js";
import type { CapabilityCatalog } from "../agents/routing/pillarStrategy/types.js";
import type { PillarId } from "../agents/routing/pillarStrategy/types.js";

export type EnvBag = Record<string, string | undefined>;

const PARKED_INTENTS = new Set<Intent>(["WEALTH", "HAPPINESS", "WISDOM"]);

/** Phase 1 product focus — perfect these before re-enabling meals (see MINIMAL_MODE_FOCUS.md). */
export const MINIMAL_FOCUS_AREAS = [
  "workouts",
  "calendar",
  "lists",
  "reminders",
  "logging",
] as const;

export type MinimalFocusArea = (typeof MINIMAL_FOCUS_AREAS)[number];

const MINIMAL_GENERAL_CAPABILITIES = new Set([
  "calendar",
  "event_log",
  "reminders",
  "day_overview",
  "youtube",
  "lists",
  "journal_note",
  "conversation",
  "pillar_consultation",
]);

const MINIMAL_HEALTH_CAPABILITIES = new Set(["fitness", "hevy_write", "generic_ack"]);

/** Magnus tools that remain callable in minimal mode. */
export const MINIMAL_MAGNUS_TOOL_NAMES = new Set([
  "read_calendar",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "connect_google",
  "connect_calendar",
  "connect_youtube",
  "log_event",
  "update_event",
  "reschedule_event",
  "list_events",
  "manage_reminders",
  "youtube_search",
  "youtube_recommend",
  "youtube_playlist",
  "youtube_bookmark",
  "youtube_cue",
  "list_catalog",
  "list_items",
  "lookup_list_item",
  "add_list_item",
  "update_list_item",
  "create_list",
  "recommend_list_items",
  "recall_context",
  "log_note",
  "get_daily_checkin",
  "log_daily_checkin",
]);

const MINIMAL_PROACTIVE_JOBS = new Set([
  "event_reminder",
  "activity_completion",
  "gym_hevy_reconcile",
  "morning_brief",
  "proactive_subscriptions",
]);

/** Catalog proactive kinds allowed in minimal mode (meals and rhythm planning excluded). */
const MINIMAL_PROACTIVE_KINDS = new Set([
  "evening_journal",
  "evening_log_followup",
  "drift_guard",
  "custom_reminder",
]);

const PARKED_GENERAL_CAPABILITY_LABELS: Record<string, string> = {
  lifeos: "LifeOS logging",
  notion: "Notion",
  proactive: "Proactive rhythm nudges",
  journal_note: "Journal notes",
  zerodha_connect: "Zerodha",
  project_setup: "Project planning",
  project_manage: "Project management",
  project_status: "Project status",
  goal_manage: "Goals",
};

const PARKED_INTENT_LABELS: Record<Intent, string> = {
  WEALTH: "Wealth / money coaching",
  HAPPINESS: "Happiness / leisure coaching",
  WISDOM: "Wisdom / learning coaching",
  HEALTH: "Health",
  GENERAL: "General",
};

export function isMinimalMode(env: EnvBag = process.env): boolean {
  const raw = env.MAGNUS_MINIMAL_MODE?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return env.NODE_ENV === "production";
}

export function isParkedIntent(intent: Intent): boolean {
  return PARKED_INTENTS.has(intent);
}

export function isParkedGeneralCapability(capability: string): boolean {
  return isMinimalMode() && !MINIMAL_GENERAL_CAPABILITIES.has(capability);
}

export function isMinimalHealthCapability(capability: string): boolean {
  return MINIMAL_HEALTH_CAPABILITIES.has(capability);
}

export function isMinimalProactiveJobEnabled(jobId: string): boolean {
  if (!isMinimalMode()) {
    return true;
  }
  return MINIMAL_PROACTIVE_JOBS.has(jobId);
}

/** Subscription catalog kinds + custom reminders allowed in minimal mode. */
export function isMinimalProactiveKindEnabled(kind: string): boolean {
  if (!isMinimalMode()) {
    return true;
  }
  return MINIMAL_PROACTIVE_KINDS.has(kind);
}

export function filterCapabilityCatalog(catalog: CapabilityCatalog): CapabilityCatalog {
  if (!isMinimalMode()) {
    return catalog;
  }

  const allowed =
    catalog.pillar === "GENERAL"
      ? MINIMAL_GENERAL_CAPABILITIES
      : catalog.pillar === "HEALTH"
        ? MINIMAL_HEALTH_CAPABILITIES
        : new Set<string>();

  if (allowed.size === 0) {
    return {
      pillar: catalog.pillar,
      capabilities: [
        {
          id: "conversation",
          summary: "Feature parked in minimal mode",
          disambiguation:
            "Direct the user to calendar, reminders, lists, YouTube, workouts, or morning brief.",
        },
      ],
    };
  }

  return {
    pillar: catalog.pillar,
    capabilities: catalog.capabilities.filter((c) => allowed.has(c.id)),
  };
}

export function filterConsultablePillars(pillars: readonly string[]): string[] {
  if (!isMinimalMode()) {
    return [...pillars];
  }
  return pillars.filter((p) => p.trim().toUpperCase() === "HEALTH");
}

export function intersectMagnusToolNames(toolNames: readonly string[]): string[] {
  if (!isMinimalMode()) {
    return [...toolNames];
  }
  return toolNames.filter((name) => MINIMAL_MAGNUS_TOOL_NAMES.has(name));
}

/** When set, runMagnusAgent uses this instead of the full tool list. */
export function magnusDefaultToolAllowlist(): string[] | undefined {
  if (!isMinimalMode()) {
    return undefined;
  }
  return [...MINIMAL_MAGNUS_TOOL_NAMES];
}

export function parkedFeatureReply(feature: string): string {
  return (
    `**${feature}** is temporarily parked while Magnus runs in minimal mode. ` +
    "Right now I'm focused on **workouts**, **calendar**, **lists**, **reminders**, and **logging** " +
    "(plus YouTube and morning brief). **Meal logging** comes next after these are solid. " +
    "Set `MAGNUS_MINIMAL_MODE=false` on the host to restore full Magnus."
  );
}

export function parkedIntentReply(intent: Intent): string {
  return parkedFeatureReply(PARKED_INTENT_LABELS[intent] ?? intent);
}

export function parkedGeneralCapabilityReply(capability: string): string {
  const label = PARKED_GENERAL_CAPABILITY_LABELS[capability] ?? capability.replace(/_/g, " ");
  return parkedFeatureReply(label);
}

export function minimalModeLogFields(env: EnvBag = process.env): Record<string, unknown> {
  if (!isMinimalMode(env)) {
    return { minimalMode: false };
  }
  return {
    minimalMode: true,
    focusAreas: [...MINIMAL_FOCUS_AREAS],
    activeGeneralCapabilities: [...MINIMAL_GENERAL_CAPABILITIES],
    activeHealthCapabilities: [...MINIMAL_HEALTH_CAPABILITIES],
    activeProactiveJobs: [...MINIMAL_PROACTIVE_JOBS],
    activeProactiveKinds: [...MINIMAL_PROACTIVE_KINDS],
  };
}

/** Map routing-parser parked topic to a user-facing parked reply (minimal mode). */
export function parkedFeatureReplyForTopic(topic: ParkedFeatureTopic): string | null {
  switch (topic) {
    case "meals":
      return parkedFeatureReply("Meals & nutrition");
    case "notion":
      return parkedGeneralCapabilityReply("notion");
    case "wealth":
      return parkedIntentReply("WEALTH");
    case "happiness":
      return parkedIntentReply("HAPPINESS");
    case "wisdom":
      return parkedIntentReply("WISDOM");
    default:
      return null;
  }
}

export function parkedPillarIds(): readonly PillarId[] {
  return ["WEALTH", "HAPPINESS", "WISDOM"];
}

