/**
 * The four pillar specialists. Magnus picks one silently, or answers himself (GENERAL).
 *
 * Health is a composite with its own sub-router and external data. The other three are single
 * prompt-only agents built on `runPillarSpecialist`.
 */
import type { Intent } from "../intent.js";
import { happinessAgent } from "./happiness/happinessAgent.js";
import { healthCompositeAgent } from "./health/healthRouter.js";
import { intentToPillarRoute } from "./routing/intentToPillarRoute.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "./types.js";
import { wealthAgent } from "./wealth/wealthAgent.js";
import { wisdomAgent } from "./wisdom/wisdomAgent.js";

const departmentAgents: DepartmentAgent[] = [
  healthCompositeAgent,
  wealthAgent,
  happinessAgent,
  wisdomAgent,
];

function agentMatches(agent: DepartmentAgent, intent: Intent, ctx?: AgentContext): boolean {
  if (agent.handles !== undefined) {
    return agent.handles(intent, ctx);
  }
  return agent.departmentId !== undefined && agent.departmentId === intent;
}

export function findAgentForIntent(intent: Intent, ctx?: AgentContext): DepartmentAgent | null {
  return departmentAgents.find((a) => agentMatches(a, intent, ctx)) ?? null;
}

export type DispatchOutcome = {
  agentName: string;
  result: AgentResult;
};

/** Runs the pillar specialist for `intent`, or returns null when none is registered. */
export async function dispatchToAgent(
  ctx: AgentContext,
  intent: Intent,
): Promise<DispatchOutcome | null> {
  const agent = findAgentForIntent(intent, ctx);
  if (!agent) {
    return null;
  }
  const route = intentToPillarRoute(intent);
  const result = await agent.run({
    ...ctx,
    intent,
    pillar: ctx.pillar ?? route.pillar,
    department: ctx.department ?? route.department,
  });
  return { agentName: agent.name, result };
}
