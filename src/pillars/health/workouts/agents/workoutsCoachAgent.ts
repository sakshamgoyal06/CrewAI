import type { AgentContext, AgentResult } from "../../../../agents/types.js";
import { tryFitnessAgent } from "./fitnessAgent.js";

/**
 * Workouts department entry — thin wrapper around the Fitness specialist flow
 * (`tryFitnessAgent` in `src/pillars/health/workouts/agents/fitnessAgent.ts`) so architecture
 * can name the Workouts coach explicitly.
 *
 * `healthRouter.ts` may later call `runWorkoutsCoachAgent` instead of `tryFitnessAgent` directly;
 * behaviour stays identical: same `AgentResult` shape on success, or `null` when this specialist
 * does not own the turn (router continues to other HEALTH specialists / generic ack — no
 * workout-specific default is injected here; that matches current router expectations).
 */
export async function runWorkoutsCoachAgent(
  ctx: AgentContext,
): Promise<AgentResult | null> {
  return tryFitnessAgent(ctx);
}
