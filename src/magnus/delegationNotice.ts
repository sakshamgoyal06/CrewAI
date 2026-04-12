import type { Intent } from "../intent.js";

/** Registry / orchestrator `name` → user-facing specialist label */
const AGENT_DISPLAY: Record<string, string> = {
  HealthComposite: "Health",
  Planner: "Planner",
  Research: "Research",
  Notion: "Notion",
};

function intentPhrase(intent: Intent): string {
  const map: Partial<Record<Intent, string>> = {
    HEALTH: "health",
    PLANNING: "planning",
    WEALTH: "wealth",
    BUILD: "build",
    RELATIONSHIPS: "relationships",
    LEARNING: "learning",
    HAPPINESS: "happiness",
    NOTION: "Notion",
    GENERAL: "general",
  };
  return map[intent] ?? intent.toLowerCase();
}

/**
 * Short Telegram copy shown before the specialist reply when delegation notices are enabled.
 */
export function formatDelegationNotice(agentName: string, intent: Intent): string {
  const label = AGENT_DISPLAY[agentName] ?? agentName;
  const topic = intentPhrase(intent);
  return (
    `🔔 Connecting you to the **${label}** specialist (${topic})…\n\n` +
    `Magnus is handing off now; you'll get their reply in a moment. Reply below to continue with this specialist, or start a new message to change topic.`
  );
}
