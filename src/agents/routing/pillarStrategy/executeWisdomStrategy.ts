/**
 * Execute a parsed WISDOM pillar strategy — prompt-only coaching today.
 */
import { runPillarSpecialist } from "../../pillarSpecialist.js";
import { WISDOM_SYSTEM } from "../../wisdom/wisdomAgent.js";
import type { AgentContext, AgentResult } from "../../types.js";
import type { PillarStrategy } from "./types.js";
import { withPillarStrategyMeta } from "./withStrategyMeta.js";

export async function executeWisdomStrategy(
  ctx: AgentContext,
  strategy: PillarStrategy,
): Promise<AgentResult> {
  const result = await runPillarSpecialist({
    ctx,
    system: WISDOM_SYSTEM,
    specialist: "Wisdom",
    pillar: "wisdom",
  });
  return withPillarStrategyMeta(result, strategy, "pillar_strategy");
}
