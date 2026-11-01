/**
 * Execute one GENERAL plan step — Magnus with capability-filtered tools.
 */
import {
  isParkedGeneralCapability,
  parkedGeneralCapabilityReply,
  intersectMagnusToolNames,
} from "../../../config/minimalMode.js";
import { runMagnusAgent } from "../../magnusAgent.js";
import type { AgentContext, AgentResult } from "../../types.js";
import { GENERAL_CAPABILITY_TOOLS } from "./catalogs/generalCatalog.js";
import { buildStepAgentContext } from "./buildStepAgentContext.js";
import { executeDayOverviewCapability } from "./dayOverview.js";
import { executePillarConsultationStep } from "./executePillarConsultation.js";
import { executeProjectCapability } from "../../../projects/projectExecutor.js";
import type { PillarPlanStep } from "./types.js";

export async function executeGeneralPlanStep(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): Promise<AgentResult> {
  const stepCtx = buildStepAgentContext(ctx, step, priorContext);

  if (isParkedGeneralCapability(step.capability)) {
    return {
      text: parkedGeneralCapabilityReply(step.capability),
      metadata: {
        specialist: "Magnus",
        parked_capability: step.capability,
        pillar_compose: false,
        magnus_voice_finalized: true,
      },
    };
  }

  if (step.capability === "pillar_consultation") {
    return executePillarConsultationStep(ctx, step, priorContext);
  }

  if (step.capability === "day_overview") {
    return executeDayOverviewCapability(stepCtx, step.args);
  }

  if (
    step.capability === "project_setup" ||
    step.capability === "project_manage" ||
    step.capability === "project_status" ||
    step.capability === "goal_manage"
  ) {
    return executeProjectCapability(stepCtx, step.capability, step.args);
  }

  const allowedToolNames = intersectMagnusToolNames(
    GENERAL_CAPABILITY_TOOLS[step.capability] ?? GENERAL_CAPABILITY_TOOLS.conversation ?? [],
  );

  return runMagnusAgent(stepCtx, {
    allowedToolNames,
    originalUserMessage: ctx.rawMessage,
  });
}
