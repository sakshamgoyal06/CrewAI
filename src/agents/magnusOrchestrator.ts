/**
 * The routing cycle behind every message.
 *
 * The user talks to Magnus and hears Magnus. Internally each turn is classified to a pillar; a
 * specialist may write the answer, but nothing in the reply says so. There are no user-facing
 * commands for choosing a lane, and no announcement when one is chosen.
 *
 * GENERAL turns with pillar signals (message or recent context) run Magnus and every relevant
 * pillar specialist in parallel; `agentConsultation` reconciles outputs.
 */
import type { Intent } from "../intent.js";
import { logger } from "../logger.js";
import { runMagnusAgent } from "./magnusAgent.js";
import { executeGeneralStrategy } from "./routing/pillarStrategy/executeGeneralStrategy.js";
import { pillarStrategyEnabled } from "./routing/pillarStrategy/parsePillarStrategy.js";
import { resolveIntentNaturalLanguage } from "./orchestratorIntent.js";
import {
  intentToMemoryPurpose,
  loadMemoryContext,
  buildMemoryPackage,
} from "./memory/memoryAgent.js";
import type { MemoryChatTurn } from "./memory/types.js";
import {
  fetchUserHealthProfile,
  runHealthOnboardingTurn,
  startHealthOnboarding,
} from "./health/healthOnboarding.js";
import { isMealCommand } from "../meals/parseMealLogCommand.js";
import { dispatchToAgent } from "./registry.js";
import { intentToPillarRoute } from "./routing/intentToPillarRoute.js";
import type { AgentContext } from "./types.js";
import { fetchRecentRoutingTurns } from "../tools/routingContext.js";
import { enforceActionIntegrity } from "./routing/actionIntegrity.js";
import { reconcileConsultationOutputs } from "./routing/agentConsultation.js";
import { resolvePillarsToConsultOnGeneral } from "./routing/pillarConsultationSignals.js";

export type OrchestratorReply = {
  replyText: string;
  intent: Intent;
  /** Internal only — recorded in chat metadata, never shown to the user. */
  delegatedAgent?: string;
  agentMetadata?: Record<string, unknown>;
  /** For post-turn memory maintenance (summary + semantic facts). */
  memoryPackageChronologicalTurns?: MemoryChatTurn[];
};

function finalizeOrchestratorReply(reply: OrchestratorReply): OrchestratorReply {
  const integrity = enforceActionIntegrity({
    text: reply.replyText,
    metadata: reply.agentMetadata,
  });
  if (!integrity.corrected) {
    return reply;
  }
  return {
    ...reply,
    replyText: integrity.text,
    agentMetadata: integrity.metadata,
  };
}

export async function runOrchestratorReply(input: {
  userMessage: string;
  userProfileId: string;
  telegramUserId: string;
  timezone?: string;
  northStarGoal?: string;
  displayName?: string;
  mealPhoto?: { fileId: string; caption?: string | null };
}): Promise<OrchestratorReply> {
  const healthProfile = await fetchUserHealthProfile(input.userProfileId);
  const healthRoute = intentToPillarRoute("HEALTH");

  // Onboarding owns every turn until it finishes, so health advice starts from real constraints.
  if (
    healthProfile &&
    !healthProfile.onboarding_completed_at &&
    !isMealCommand(input.userMessage) &&
    !input.mealPhoto?.fileId
  ) {
    const ob = await runHealthOnboardingTurn(
      {
        userMessage: input.userMessage,
        userProfileId: input.userProfileId,
        telegramUserId: input.telegramUserId,
      },
      healthProfile,
    );
    return finalizeOrchestratorReply({
      replyText: ob.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: {
        ...ob.metadata,
        pillar: healthRoute.pillar,
        department: healthRoute.department,
      },
    });
  }

  const recentTurns = await fetchRecentRoutingTurns(
    input.userProfileId,
    input.telegramUserId,
  );
  const intent = input.mealPhoto?.fileId
    ? ("HEALTH" as Intent)
    : await resolveIntentNaturalLanguage(input.userMessage, { recentTurns });

  if (
    intent === "HEALTH" &&
    !healthProfile &&
    !isMealCommand(input.userMessage) &&
    !input.mealPhoto?.fileId
  ) {
    const started = await startHealthOnboarding({
      userMessage: input.userMessage,
      userProfileId: input.userProfileId,
      telegramUserId: input.telegramUserId,
    });
    return finalizeOrchestratorReply({
      replyText: started.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: {
        ...started.metadata,
        pillar: healthRoute.pillar,
        department: healthRoute.department,
      },
    });
  }

  const pillarRoute = intentToPillarRoute(intent);

  const memory = await loadMemoryContext({
    userProfileId: input.userProfileId,
    telegramUserId: input.telegramUserId,
    purpose: intentToMemoryPurpose(intent),
  });
  const memoryPackage = await buildMemoryPackage({
    memory,
    intent,
    rawMessage: input.userMessage,
    userProfileId: input.userProfileId,
  });
  const memoryBlock = memoryPackage.memoryBlock;

  const ctx: AgentContext = {
    userProfileId: input.userProfileId,
    telegramUserId: input.telegramUserId,
    timezone: input.timezone,
    northStarGoal: input.northStarGoal,
    displayName: input.displayName,
    rawMessage: input.userMessage,
    mealPhoto: input.mealPhoto,
    intent,
    memoryBlock,
    memoryPackage,
    pillar: pillarRoute.pillar,
    department: pillarRoute.department,
  };

  logger.debug(
    {
      module: "magnusOrchestrator",
      intent,
      pillar: pillarRoute.pillar,
      memoryGapCount: memory.gaps.length,
      memoryRecentTurns: memory.recentSignals.recentChatTurns.length,
    },
    "turn routed",
  );

  if (intent === "GENERAL") {
    const pillarsToConsult = resolvePillarsToConsultOnGeneral({
      userMessage: input.userMessage,
      recentTurns,
    });

    if (pillarsToConsult.length === 0) {
      const magnus = pillarStrategyEnabled()
        ? await executeGeneralStrategy(ctx)
        : await runMagnusAgent(ctx);
      return finalizeOrchestratorReply({
        replyText: magnus.text,
        intent,
        agentMetadata: magnus.metadata,
        memoryPackageChronologicalTurns: memoryPackage.chronologicalTurns,
      });
    }

    const [magnus, ...pillarDispatches] = await Promise.all([
      runMagnusAgent(ctx),
      ...pillarsToConsult.map(async (pillarIntent) => {
        const route = intentToPillarRoute(pillarIntent);
        const dispatch = await dispatchToAgent(
          {
            ...ctx,
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
      userMessage: input.userMessage,
      magnus,
      pillars: pillarDispatches.filter((p): p is NonNullable<typeof p> => p !== null),
    });

    logger.debug(
      {
        module: "magnusOrchestrator",
        consultation: reconciled.consulted,
        pillarsConsulted: pillarsToConsult,
        primary: reconciled.primarySource,
        reason: reconciled.reason,
      },
      "general turn with pillar consultation",
    );

    return finalizeOrchestratorReply({
      replyText: reconciled.text,
      intent,
      delegatedAgent: reconciled.delegatedAgent,
      agentMetadata: reconciled.metadata,
      memoryPackageChronologicalTurns: memoryPackage.chronologicalTurns,
    });
  }

  const delegated = await dispatchToAgent(ctx, intent);
  if (delegated) {
    return finalizeOrchestratorReply({
      replyText: delegated.result.text,
      intent,
      delegatedAgent: delegated.agentName,
      agentMetadata: {
        pillar: pillarRoute.pillar,
        department: pillarRoute.department,
        ...delegated.result.metadata,
      },
      memoryPackageChronologicalTurns: memoryPackage.chronologicalTurns,
    });
  }

  // Unreachable while every pillar has an agent; Magnus answers rather than apologising.
  logger.warn({ intent }, "no specialist registered for intent; Magnus answering");
  const fallback = await runMagnusAgent(ctx);
  return finalizeOrchestratorReply({
    replyText: fallback.text,
    intent,
    agentMetadata: { ...fallback.metadata, unrouted: true },
    memoryPackageChronologicalTurns: memoryPackage.chronologicalTurns,
  });
}
