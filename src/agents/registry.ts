import type { Intent } from "../intent.js";
import { healthCompositeAgent } from "./health/healthRouter.js";
import { researchAgent } from "./intelligence/researchAgent.js";
import { notionAgent } from "./knowledge/notionAgent.js";
import { plannerAgent } from "./planning/plannerAgent.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "./types.js";

/**
 * Priority order: first matching agent wins (no overlap on intent id today).
 */
const departmentAgents: DepartmentAgent[] = [
  notionAgent,
  healthCompositeAgent,
  plannerAgent,
  researchAgent,
];

function agentMatches(agent: DepartmentAgent, intent: Intent): boolean {
  if (agent.departmentId !== undefined && agent.departmentId === intent) {
    return true;
  }
  if (agent.handles !== undefined) {
    return agent.handles(intent);
  }
  return false;
}

/** First registered specialist for `intent`, without running. Used for progress UX before `dispatchToAgent`. */
export function findAgentForIntent(intent: Intent): DepartmentAgent | null {
  for (const agent of departmentAgents) {
    if (agentMatches(agent, intent)) {
      return agent;
    }
  }
  return null;
}

export type DispatchOutcome = {
  agentName: string;
  result: AgentResult;
};

/**
 * Runs the first registered specialist that matches `intent`.
 * Returns `null` when no department agent handles this intent — orchestrator should fall back.
 */
export async function dispatchToAgent(
  ctx: AgentContext,
  intent: Intent,
): Promise<DispatchOutcome | null> {
  const agent = findAgentForIntent(intent);
  if (!agent) {
    return null;
  }
  const fullCtx: AgentContext = { ...ctx, intent };
  const result = await agent.run(fullCtx);
  return { agentName: agent.name, result };
}
