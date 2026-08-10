/**
 * The routing cycle behind every message.
 *
 * Architecture: **input parse → execute → output parse (compose)** per pillar.
 * The user always hears Magnus; terminal entry (intent) and exit (voice) stay in Magnus's voice.
 */
import type { Intent } from "../intent.js";
import { logger } from "../logger.js";
import { runMagnusAgent } from "./magnusAgent.js";
import { executeGeneralStrategy } from "./routing/pillarStrategy/executeGeneralStrategy.js";
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
import { finalizeMagnusVoice } from "./routing/finalizeMagnusVoice.js";
import { augmentMessageWithPhotoContext } from "../vision/augmentMessageWithPhoto.js";
import { buildPhotoContext } from "../vision/buildPhotoContext.js";
import { isMealPhotoPurpose, resolvePhotoIntent } from "../vision/resolvePhotoIntent.js";

export type OrchestratorReply = {
  replyText: string;
  intent: Intent;
  /** Internal only — recorded in chat metadata, never shown to the user. */
  delegatedAgent?: string;
  agentMetadata?: Record<string, unknown>;
  /** For post-turn memory maintenance (summary + semantic facts). */
  memoryPackageChronologicalTurns?: MemoryChatTurn[];
};

async function finalizeOrchestratorReply(
  ctx: AgentContext,
  reply: OrchestratorReply,
): Promise<OrchestratorReply> {
  const voiced = await finalizeMagnusVoice(ctx, reply.replyText, reply.agentMetadata ?? {});
  const integrity = enforceActionIntegrity({
    text: voiced.text,
    metadata: voiced.metadata,
  });
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
    const ctx: AgentContext = {
      userProfileId: input.userProfileId,
      telegramUserId: input.telegramUserId,
      timezone: input.timezone,
      rawMessage: input.userMessage,
      intent: "HEALTH",
    };
    return finalizeOrchestratorReply(ctx, {
      replyText: ob.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: {
        ...ob.metadata,
        pillar: healthRoute.pillar,
        department: healthRoute.department,
        pillar_compose: false,
        magnus_voice_finalized: true,
      },
    });
  }

  const recentTurns = await fetchRecentRoutingTurns(
    input.userProfileId,
    input.telegramUserId,
  );

  const photoTurnPreviews = recentTurns.slice(-6).map((t) => ({
    role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
    preview: t.content.slice(0, 280),
  }));

  const photoContext = input.mealPhoto?.fileId
    ? await buildPhotoContext({
        photo: input.mealPhoto,
        recentTurns: photoTurnPreviews,
      })
    : undefined;

  const effectiveUserMessage = photoContext
    ? augmentMessageWithPhotoContext(input.userMessage, photoContext)
    : input.userMessage;

  const intent = photoContext
    ? resolvePhotoIntent(photoContext)
    : await resolveIntentNaturalLanguage(effectiveUserMessage, { recentTurns });

  if (
    intent === "HEALTH" &&
    !healthProfile &&
    !isMealCommand(effectiveUserMessage) &&
    !isMealPhotoPurpose(photoContext)
  ) {
    const started = await startHealthOnboarding({
      userMessage: input.userMessage,
      userProfileId: input.userProfileId,
      telegramUserId: input.telegramUserId,
    });
    const ctx: AgentContext = {
      userProfileId: input.userProfileId,
      telegramUserId: input.telegramUserId,
      timezone: input.timezone,
      rawMessage: effectiveUserMessage,
      intent: "HEALTH",
    };
    return finalizeOrchestratorReply(ctx, {
      replyText: started.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: {
        ...started.metadata,
        pillar: healthRoute.pillar,
        department: healthRoute.department,
        pillar_compose: false,
        magnus_voice_finalized: true,
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
    rawMessage: effectiveUserMessage,
    userProfileId: input.userProfileId,
  });
  const memoryBlock = memoryPackage.memoryBlock;

  const ctx: AgentContext = {
    userProfileId: input.userProfileId,
    telegramUserId: input.telegramUserId,
    timezone: input.timezone,
    northStarGoal: input.northStarGoal,
    displayName: input.displayName,
    rawMessage: effectiveUserMessage,
    mealPhoto: input.mealPhoto,
    photoContext,
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
      photoPurpose: photoContext?.analysis.purpose ?? null,
      memoryGapCount: memory.gaps.length,
      memoryRecentTurns: memory.recentSignals.recentChatTurns.length,
    },
    "turn routed",
  );

  if (intent === "GENERAL") {
    const magnus = await executeGeneralStrategy(ctx);
    return finalizeOrchestratorReply(ctx, {
      replyText: magnus.text,
      intent,
      agentMetadata: {
        ...magnus.metadata,
        ...(photoContext
          ? {
              photo_vision: {
                purpose: photoContext.analysis.purpose,
                confidence: photoContext.analysis.confidence,
              },
            }
          : {}),
      },
      memoryPackageChronologicalTurns: memoryPackage.chronologicalTurns,
    });
  }

  const delegated = await dispatchToAgent(ctx, intent);
  if (delegated) {
    return finalizeOrchestratorReply(ctx, {
      replyText: delegated.result.text,
      intent,
      delegatedAgent: delegated.agentName,
      agentMetadata: {
        pillar: pillarRoute.pillar,
        department: pillarRoute.department,
        ...delegated.result.metadata,
        ...(photoContext
          ? {
              photo_vision: {
                purpose: photoContext.analysis.purpose,
                confidence: photoContext.analysis.confidence,
              },
            }
          : {}),
      },
      memoryPackageChronologicalTurns: memoryPackage.chronologicalTurns,
    });
  }

  logger.warn({ intent }, "no specialist registered for intent; Magnus answering");
  const fallback = await runMagnusAgent(ctx);
  return finalizeOrchestratorReply(ctx, {
    replyText: fallback.text,
    intent,
    agentMetadata: { ...fallback.metadata, unrouted: true },
    memoryPackageChronologicalTurns: memoryPackage.chronologicalTurns,
  });
}
