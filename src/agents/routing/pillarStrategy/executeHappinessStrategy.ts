/**
 * Execute a parsed HAPPINESS pillar strategy — prompt-only coaching today.
 */
import { HAPPINESS_SYSTEM } from "../../happiness/happinessAgent.js";
import { runPillarSpecialist } from "../../pillarSpecialist.js";
import type { AgentContext, AgentResult } from "../../types.js";
import type { PillarStrategy } from "./types.js";
import { withPillarStrategyMeta } from "./withStrategyMeta.js";

export async function executeHappinessStrategy(
  ctx: AgentContext,
  strategy: PillarStrategy,
): Promise<AgentResult> {
  const result = await runPillarSpecialist({
    ctx,
    system: HAPPINESS_SYSTEM,
    specialist: "Happiness",
    pillar: "joy",
  });
  return withPillarStrategyMeta(result, strategy, "pillar_strategy");
}
