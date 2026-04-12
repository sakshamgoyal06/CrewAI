/**
 * Shared types for department specialists (orchestrator delegates here).
 */
import type { Intent } from "../intent.js";
import type { Pillar } from "./routing/pillarTypes.js";

export type HealthSubIntent = "FITNESS" | "NUTRITION" | "ENERGY" | "OTHER";

export type AgentContext = {
  userProfileId: string;
  telegramUserId: string;
  timezone?: string;
  /** From `user_profile.north_star_goal` when loaded; optional for specialists. */
  northStarGoal?: string;
  rawMessage: string;
  intent: Intent;
  /**
   * Preformatted memory from `loadMemoryContext` — orchestrator-only; augment specialist prompts.
   */
  memoryBlock?: string;
  /**
   * Onboarding-completed health preferences (from `user_health_profile`), appended to specialist prompts.
   */
  healthPreferences?: string;
  /** Pillar when routing has classified it (optional until classifier wiring is complete). */
  pillar?: Pillar;
  /** Department id (e.g. snake_case from routing) when known. */
  department?: string;
  /** Specialist id or label when a primary specialist is selected. */
  specialist?: string;
  /** Set when the user message came from a Telegram `/command` (payload only in `rawMessage`). */
  slashCommandKey?: string;
};

export type AgentResult = {
  text: string;
  metadata: Record<string, unknown>;
};

/**
 * Pluggable department specialist. Use either `departmentId` (fixed intent) or
 * `handles` for custom matching; first registered match wins.
 */
export type DepartmentAgent = {
  name: string;
  departmentId?: Intent;
  /** When set, `ctx` is the same shape as specialist `run` receives (may omit memory before orchestrator load). */
  handles?: (intent: Intent, ctx?: AgentContext) => boolean;
  run: (ctx: AgentContext) => Promise<AgentResult>;
};
