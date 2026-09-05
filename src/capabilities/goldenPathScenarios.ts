/**
 * Golden-path scenarios: user asks → full orchestrator pipeline (LLM fixture-driven).
 * First 100 catalog entries — diverse across pillars and capabilities.
 */
import type { Intent } from "../intent.js";
import { USER_QUERY_CATALOG, type UserQueryExpectation } from "./userQueryCatalog.js";

export type GoldenPathScenario = UserQueryExpectation & {
  /** Expected delegated_agent metadata (undefined for GENERAL Magnus-only) */
  expectedDelegatedAgent?: string;
  /** When GENERAL uses tools, primary tool we fixture the model to invoke */
  expectedPrimaryTool?: string;
};

const DELEGATED_BY_INTENT: Record<Intent, string | undefined> = {
  HEALTH: "HealthComposite",
  WEALTH: "Wealth",
  HAPPINESS: "Happiness",
  WISDOM: "Wisdom",
  GENERAL: undefined,
};

/** Map GENERAL capability → tool the fixture model should call first */
export function primaryToolForGeneralCapability(
  capability: string,
  query: string,
): string | undefined {
  const q = query.toLowerCase();
  switch (capability) {
    case "calendar":
      return /schedule|book|create|cancel|move|delete/i.test(q)
        ? q.includes("cancel") || q.includes("delete")
          ? "delete_calendar_event"
          : q.includes("move")
            ? "update_calendar_event"
            : "create_calendar_event"
        : "read_calendar";
    case "lists":
      if (/add_|add /i.test(q)) return "add_list_item";
      if (/create_list/i.test(q)) return "create_list";
      if (/recommend/i.test(q)) return "recommend_list_items";
      return "list_items";
    case "youtube":
      if (/playlist|add to/i.test(q)) return "youtube_playlist";
      if (/bookmark/i.test(q)) return "youtube_bookmark";
      if (/cue|queue|play next/i.test(q)) return "youtube_cue";
      if (/connect/i.test(q)) return "connect_google";
      return "youtube_search";
    case "event_log":
      if (/log_event/i.test(q) || /log gym/i.test(q)) return "log_event";
      if (/reschedule/i.test(q)) return "reschedule_event";
      if (/update_event/i.test(q)) return "update_event";
      return "list_events";
    case "lifeos":
      if (/check[\s-]?in/i.test(q)) return "log_daily_checkin";
      if (/joy/i.test(q)) return "log_joy_tank";
      if (/pillar/i.test(q)) return "update_pillar_status";
      if (/goal/i.test(q)) return "add_goal";
      return "get_daily_checkin";
    case "notion":
      if (/sync/i.test(q)) return "sync_notion";
      if (/setup/i.test(q)) return "setup_notion";
      return "connect_notion";
    case "reminders":
      return "manage_reminders";
    case "proactive":
      return "manage_proactive_messages";
    case "journal_note":
      return "log_note";
    case "zerodha_connect":
      return "connect_kite";
    default:
      return undefined;
  }
}

export function buildGoldenPathScenarios(limit = 100): GoldenPathScenario[] {
  return USER_QUERY_CATALOG.slice(0, limit).map((entry) => {
    const expectedDelegatedAgent = DELEGATED_BY_INTENT[entry.idealIntent];
    const expectedPrimaryTool =
      entry.idealIntent === "GENERAL" && entry.magnusTools
        ? primaryToolForGeneralCapability(entry.idealCapability, entry.query)
        : undefined;
    return {
      ...entry,
      expectedDelegatedAgent,
      expectedPrimaryTool,
    };
  });
}

export const GOLDEN_PATH_SCENARIOS = buildGoldenPathScenarios(100);
