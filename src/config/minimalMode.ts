/**
 * Minimal Magnus — production strip-down while core paths are stabilized.
 *
 * Keeps: sub-agent parse → execute → compose, calendar, Hevy/fitness, reminders, lists,
 * YouTube, morning brief, logging.
 * Parks: meals, Notion, LifeOS, projects, wealth/happiness/wisdom depth, vision/photos,
 * rhythm subscriptions, nutrition nightly, and most proactive nudges.
 *
 * Set MAGNUS_MINIMAL_MODE=false on the host to restore full Magnus.
 */
import type { Intent } from "../intent.js";
import type { CapabilityCatalog } from "../agents/routing/pillarStrategy/types.js";
import type { PillarId } from "../agents/routing/pillarStrategy/types.js";

export type EnvBag = Record<string, string | undefined>;

const PARKED_INTENTS = new Set<Intent>(["WEALTH", "HAPPINESS", "WISDOM"]);

const MINIMAL_GENERAL_CAPABILITIES = new Set([
  "calendar",
  "event_log",
  "reminders",
  "day_overview",
  "youtube",
  "lists",
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
]);

const MINIMAL_PROACTIVE_JOBS = new Set([
  "event_reminder",
  "gym_hevy_reconcile",
  "morning_brief",
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
    "I can still help with **calendar**, **reminders**, **lists**, **YouTube**, **morning brief**, " +
    "**workouts / Hevy**, and general conversation. " +
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
    activeGeneralCapabilities: [...MINIMAL_GENERAL_CAPABILITIES],
    activeHealthCapabilities: [...MINIMAL_HEALTH_CAPABILITIES],
    activeProactiveJobs: [...MINIMAL_PROACTIVE_JOBS],
  };
}

export function isMealRelatedTurn(input: {
  message: string;
  mealPhoto?: { fileId: string } | null;
}): boolean {
  if (input.mealPhoto?.fileId) {
    return true;
  }
  const lower = input.message.trim().toLowerCase();
  if (
    /\b(?:recommend|watchlist|readlist|from my .+ list|list_items|add .+ to .+list)\b/i.test(
      lower,
    )
  ) {
    return false;
  }
  return (
    /\b(?:log|logged|ate|had|eating|lunch|breakfast|dinner|snack|meal|calorie|macro|protein)\b/i.test(
      lower,
    ) && !/\b(?:train|workout|gym|hevy|calendar|remind)\b/i.test(lower)
  );
}

export function parkedPillarIds(): readonly PillarId[] {
  return ["WEALTH", "HAPPINESS", "WISDOM"];
}

/**
 * When minimal mode classifies a parked pillar topic as GENERAL, still return a parked reply.
 */
export function parkedGeneralTopicReply(message: string): string | null {
  const lower = message.trim().toLowerCase();
  if (/\b(?:notion|lifeos|connect_notion|sync_notion|setup_notion)\b/i.test(lower)) {
    return parkedGeneralCapabilityReply("notion");
  }
  if (
    /\b(?:zerodha|kite|portfolio|holdings|sips?|net worth|budget|investing|stock holdings)\b/i.test(
      lower,
    )
  ) {
    return parkedIntentReply("WEALTH");
  }
  if (
    /\b(?:recommend a movie|pick a movie|poetry mic|leisure coach|happiness coach)\b/i.test(
      lower,
    )
  ) {
    return parkedIntentReply("HAPPINESS");
  }
  if (/\b(?:learning plan|career coach|wisdom coach|skill sprint)\b/i.test(lower)) {
    return parkedIntentReply("WISDOM");
  }
  return null;
}
