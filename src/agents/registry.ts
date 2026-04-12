import type { Intent } from "../intent.js";
import { healthCompositeAgent } from "./health/healthRouter.js";
import { cultureRecommenderAgent } from "./joy/cultureRecommenderAgent.js";
import { relationshipCoachAgent } from "./joy/relationshipCoachAgent.js";
import { tripDesignerAgent } from "./joy/tripDesignerAgent.js";
import { notionAgent } from "./knowledge/notionAgent.js";
import { plannerAgent } from "./planning/plannerAgent.js";
import { intentToPillarRoute } from "./routing/intentToPillarRoute.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "./types.js";
import { buildShipAgent } from "./wisdom/buildShipAgent.js";
import { learningPlanAgent } from "./wisdom/learningPlanAgent.js";
import { learningTrackerAgent } from "./wisdom/learningTrackerAgent.js";
import { wealthCompositeAgent } from "./wealth/wealthRouter.js";

/**
 * Priority order: first matching agent wins (no overlap on intent id today).
 */
const departmentAgents: DepartmentAgent[] = [
  notionAgent,
  healthCompositeAgent,
  wealthCompositeAgent,
  plannerAgent,
  learningTrackerAgent,
  learningPlanAgent,
  buildShipAgent,
  relationshipCoachAgent,
  tripDesignerAgent,
  cultureRecommenderAgent,
];

function agentMatches(agent: DepartmentAgent, intent: Intent, ctx?: AgentContext): boolean {
  if (agent.handles !== undefined) {
    return agent.handles(intent, ctx);
  }
  if (agent.departmentId !== undefined && agent.departmentId === intent) {
    return true;
  }
  return false;
}

/** First registered specialist for `intent`, without running. Used for progress UX before `dispatchToAgent`. */
export function findAgentForIntent(intent: Intent, ctx?: AgentContext): DepartmentAgent | null {
  for (const agent of departmentAgents) {
    if (agentMatches(agent, intent, ctx)) {
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
  const agent = findAgentForIntent(intent, ctx);
  if (!agent) {
    return null;
  }
  const route = intentToPillarRoute(intent);
  const fullCtx: AgentContext = {
    ...ctx,
    intent,
    pillar: ctx.pillar ?? route.pillar,
    department: ctx.department ?? route.department,
  };
  const result = await agent.run(fullCtx);
  return { agentName: agent.name, result };
}
