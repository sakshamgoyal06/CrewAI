import type { AgentResult } from "../../types.js";
import type { PillarStrategy } from "./types.js";

export function withPillarStrategyMeta(
  result: AgentResult,
  strategy: PillarStrategy,
  router: string,
  extra?: Record<string, unknown>,
): AgentResult {
  return {
    text: result.text,
    metadata: {
      ...result.metadata,
      pillar_router: router,
      pillar_capability: strategy.capability,
      pillar_strategy_confidence: strategy.confidence,
      pillar_strategy_parser: strategy.parser,
      ...extra,
    },
  };
}
