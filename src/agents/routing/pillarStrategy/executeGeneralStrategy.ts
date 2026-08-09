/**
 * Execute a parsed GENERAL pillar strategy — Magnus with capability-filtered tools.
 */
import { runMagnusAgent } from "../../magnusAgent.js";
import type { AgentContext, AgentResult } from "../../types.js";
import { buildRoutingHints } from "./buildRoutingHints.js";
import { GENERAL_CAPABILITY_TOOLS } from "./catalogs/generalCatalog.js";
import { parsePillarStrategy } from "./parsePillarStrategy.js";
import type { PillarStrategy } from "./types.js";
import { withPillarStrategyMeta } from "./withStrategyMeta.js";

export async function executeGeneralStrategy(
  ctx: AgentContext,
  strategy?: PillarStrategy,
): Promise<AgentResult> {
  const hints = await buildRoutingHints(ctx);
  const resolved =
    strategy ?? ctx.pillarStrategy ?? (await parsePillarStrategy("GENERAL", ctx.rawMessage, hints));
  const ctxWithStrategy = { ...ctx, pillarStrategy: resolved };

  const allowedToolNames =
    GENERAL_CAPABILITY_TOOLS[resolved.capability] ?? GENERAL_CAPABILITY_TOOLS.conversation ?? [];

  const result = await runMagnusAgent(ctxWithStrategy, { allowedToolNames });
  return withPillarStrategyMeta(result, resolved, "pillar_strategy", {
    magnus_capability: resolved.capability,
    magnus_tools_allowed: allowedToolNames,
  });
}
