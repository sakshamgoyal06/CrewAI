/**
 * Parser-driven GENERAL step: Magnus + selected pillar specialists, then reconcile for compose.
 */
import { dispatchToAgent } from "../../registry.js";
import { runMagnusAgent } from "../../magnusAgent.js";
import { reconcileConsultationOutputs } from "../agentConsultation.js";
import { buildMagnusConsultationDelegationBlock } from "../consultationOutcome.js";
import type { ConsultablePillarIntent } from "../pillarConsultationSignals.js";
import { intentToPillarRoute } from "../intentToPillarRoute.js";
import type { AgentContext, AgentResult } from "../../types.js";
import type { PillarPlanStep } from "./types.js";
import { buildStepAgentContext } from "./buildStepAgentContext.js";

const CONSULTABLE: ConsultablePillarIntent[] = ["HEALTH", "WEALTH", "HAPPINESS", "WISDOM"];

function normalizePillarArg(raw: unknown): ConsultablePillarIntent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ConsultablePillarIntent[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }
    const upper = item.trim().toUpperCase();
    if (CONSULTABLE.includes(upper as ConsultablePillarIntent)) {
      out.push(upper as ConsultablePillarIntent);
    }
  }
  return [...new Set(out)];
}

export async function executePillarConsultationStep(
  ctx: AgentContext,
  step: PillarPlanStep,
  priorContext: string,
): Promise<AgentResult> {
  const stepCtx = buildStepAgentContext(ctx, step, priorContext);
  const pillars = normalizePillarArg(step.args.pillars);
  const consultationDelegation = buildMagnusConsultationDelegationBlock(pillars);

  const [magnus, ...pillarDispatches] = await Promise.all([
    runMagnusAgent(stepCtx, {
      originalUserMessage: ctx.rawMessage,
      consultationDelegation,
    }),
    ...pillars.map(async (pillarIntent) => {
      const route = intentToPillarRoute(pillarIntent);
      const dispatch = await dispatchToAgent(
        {
          ...stepCtx,
          intent: pillarIntent,
          pillar: route.pillar,
          department: route.department,
        },
        pillarIntent,
      );
      return dispatch
        ? {
            intent: pillarIntent,
            agentName: dispatch.agentName,
            result: dispatch.result,
          }
        : null;
    }),
  ]);

  const reconciled = reconcileConsultationOutputs({
    userMessage: ctx.rawMessage,
    magnus,
    pillars: pillarDispatches.filter((p): p is NonNullable<typeof p> => p !== null),
  });

  return {
    text: reconciled.text,
    metadata: {
      ...reconciled.metadata,
      specialist: "Magnus",
      pillar_consultation: true,
      consulted_pillars: reconciled.consulted,
      pillar_compose: true,
    },
  };
}
