/**
 * Output parser — every user-facing turn exits in Magnus's voice unless explicitly opted out.
 * Called at the orchestrator boundary when inner pipelines did not already compose.
 */
import type { AgentContext } from "../types.js";
import { composePillarPlanReply } from "./pillarStrategy/composePillarPlanReply.js";
import { pillarPlanComposeEnabled } from "./pillarStrategy/parsePillarStrategy.js";
import type { PillarExecutionPlan } from "./pillarStrategy/types.js";

const ORCHESTRATOR_PLAN: PillarExecutionPlan = {
  steps: [{ capability: "orchestrator", args: {} }],
  confidence: 1,
  parser: "deterministic",
};

export function magnusVoiceAlreadyFinalized(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.magnus_voice_finalized === true;
}

/** Re-voice internal executor output as Magnus (terminal output parser). */
export async function finalizeMagnusVoice(
  ctx: AgentContext,
  text: string,
  metadata: Record<string, unknown> = {},
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  if (!pillarPlanComposeEnabled()) {
    return { text, metadata };
  }
  if (metadata.pillar_compose === false) {
    return { text, metadata: { ...metadata, magnus_voice_finalized: true } };
  }
  if (magnusVoiceAlreadyFinalized(metadata)) {
    return { text, metadata };
  }

  const composed = await composePillarPlanReply(ctx, ORCHESTRATOR_PLAN, [
    {
      step_index: 0,
      capability: "orchestrator",
      text,
      metadata: { ...metadata, pillar_compose: true },
    },
  ]);

  return {
    text: composed,
    metadata: { ...metadata, magnus_voice_finalized: true },
  };
}
