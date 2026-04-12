/**
 * Shared types for department specialists (orchestrator delegates here).
 */
import type { Intent } from "../intent.js";

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
  handles?: (intent: Intent) => boolean;
  run: (ctx: AgentContext) => Promise<AgentResult>;
};
