import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import type { Intent } from "../intent.js";
import { logger } from "../logger.js";
import { anthropic } from "../tools/clients.js";
import { runResearchAgent } from "./intelligence/researchAgent.js";
import { isResearchSubIntent } from "./intelligence/researchRouting.js";
import { resolveIntentNaturalLanguage } from "./orchestratorIntent.js";
import {
  augmentUserWithMemory,
  formatMemoryBlockForSystem,
  intentToMemoryPurpose,
  loadMemoryContext,
} from "./memory/memoryAgent.js";
import {
  fetchUserHealthProfile,
  runHealthOnboardingTurn,
  startHealthOnboarding,
} from "./health/healthOnboarding.js";
import { isMealCommand } from "../meals/parseMealLogCommand.js";
import { dispatchToAgent, findAgentForIntent } from "./registry.js";
import { intentToPillarRoute, resolvePillarRoute } from "./routing/intentToPillarRoute.js";
import {
  effectiveSlashUserMessage,
  parseSlashCommand,
  type SlashDirectRoute,
} from "./routing/slashCommands.js";
import type { DepartmentId } from "./routing/pillarTypes.js";
import type { AgentContext } from "./types.js";

const MODEL = "claude-sonnet-4-6";

const GENERAL_SYSTEM =
  "You are MAGNUS, a warm and direct personal AI chief of staff for Saksham. Keep replies under 100 words.";

export type OrchestratorReply = {
  replyText: string;
  intent: Intent;
  delegatedAgent?: string;
  agentMetadata?: Record<string, unknown>;
};

/** Fired when Magnus commits to a specialist — before memory load and specialist LLM. */
export type BeforeDelegationInfo = {
  intent: Intent;
  delegatedAgent: string;
};

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export function routingPlaceholder(intent: Exclude<Intent, "GENERAL">): string {
  return `🧠 MAGNUS routing to ${intent} department... (agents coming soon)`;
}

async function answerGeneral(
  userMessage: string,
  memoryBlock?: string,
): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: GENERAL_SYSTEM,
    messages: [
      { role: "user", content: augmentUserWithMemory(userMessage, memoryBlock) },
    ],
  });
  return textFromMessage(msg).trim() || "…";
}

function slashMetadata(slash: SlashDirectRoute | null): Record<string, unknown> {
  return slash ? { slash_command: slash.commandKey } : {};
}

/**
 * Single entry for chat: health onboarding gates → intent (slash **or** natural-language cycle) →
 * pillar/department → memory → specialist / Research / general.
 */
export async function runOrchestratorReply(input: {
  userMessage: string;
  userProfileId: string;
  telegramUserId: string;
  timezone?: string;
  northStarGoal?: string;
  /** "1" = Planner, "2" = Research — skips classify. */
  disambiguationChoice?: "1" | "2";
  onBeforeDelegation?: (info: BeforeDelegationInfo) => void | Promise<void>;
}): Promise<OrchestratorReply> {
  const healthProfile = await fetchUserHealthProfile(input.userProfileId);

  if (
    healthProfile &&
    !healthProfile.onboarding_completed_at &&
    !isMealCommand(input.userMessage)
  ) {
    await input.onBeforeDelegation?.({
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
    });
    const ob = await runHealthOnboardingTurn(
      {
        userMessage: input.userMessage,
        userProfileId: input.userProfileId,
        telegramUserId: input.telegramUserId,
      },
      healthProfile,
    );
    const healthRoute = intentToPillarRoute("HEALTH");
    return {
      replyText: ob.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: {
        ...ob.metadata,
        pillar: healthRoute.pillar,
        department: healthRoute.department,
      },
    };
  }

  let intent: Intent;
  let userMessageForAgent = input.userMessage;
  let slashRoute: SlashDirectRoute | null = null;

  if (input.disambiguationChoice === "1") {
    intent = "PLANNING";
  } else if (input.disambiguationChoice === "2") {
    intent = "GENERAL";
  } else {
    slashRoute = parseSlashCommand(input.userMessage);
    if (slashRoute) {
      intent = slashRoute.intent;
      userMessageForAgent = effectiveSlashUserMessage(slashRoute);
    } else {
      intent = await resolveIntentNaturalLanguage(input.userMessage);
    }
  }

  const slashDept: DepartmentId | undefined =
    slashRoute && !slashRoute.forceResearch ? slashRoute.department : undefined;

  if (intent === "HEALTH" && !healthProfile && !isMealCommand(input.userMessage)) {
    await input.onBeforeDelegation?.({
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
    });
    const started = await startHealthOnboarding({
      userMessage: input.userMessage,
      userProfileId: input.userProfileId,
      telegramUserId: input.telegramUserId,
    });
    const healthRoute = intentToPillarRoute("HEALTH");
    return {
      replyText: started.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: {
        ...started.metadata,
        pillar: healthRoute.pillar,
        department: healthRoute.department,
      },
    };
  }

  const willResearch =
    intent === "GENERAL" &&
    (input.disambiguationChoice === "2" ||
      slashRoute?.forceResearch === true ||
      isResearchSubIntent(userMessageForAgent));

  const pillarRoute = resolvePillarRoute(intent, slashDept);
  const routingCtx: AgentContext = {
    userProfileId: input.userProfileId,
    telegramUserId: input.telegramUserId,
    timezone: input.timezone,
    northStarGoal: input.northStarGoal,
    rawMessage: userMessageForAgent,
    intent,
    pillar: pillarRoute.pillar,
    department: pillarRoute.department,
  };
  const specialistForIntent =
    intent === "GENERAL" ? null : findAgentForIntent(intent, routingCtx);

  if (willResearch) {
    await input.onBeforeDelegation?.({
      intent: "GENERAL",
      delegatedAgent: "Research",
    });
  } else if (specialistForIntent !== null) {
    await input.onBeforeDelegation?.({
      intent,
      delegatedAgent: specialistForIntent.name,
    });
  }

  const needsMemory = intent === "GENERAL" || specialistForIntent !== null;

  let memoryBlock = "";
  if (needsMemory) {
    const memory = await loadMemoryContext({
      userProfileId: input.userProfileId,
      telegramUserId: input.telegramUserId,
      purpose: intentToMemoryPurpose(intent),
    });
    memoryBlock = formatMemoryBlockForSystem(memory);
    logger.debug(
      {
        module: "magnusOrchestrator",
        intent,
        pillar: pillarRoute.pillar,
        department: pillarRoute.department,
        memoryPurpose: memory.purpose,
        memoryGapCount: memory.gaps.length,
        memoryRecentTurns: memory.recentSignals.recentChatTurns.length,
      },
      "memory context prepared for turn",
    );
  }

  if (intent === "GENERAL") {
    if (willResearch) {
      const research = await runResearchAgent({
        userProfileId: input.userProfileId,
        telegramUserId: input.telegramUserId,
        timezone: input.timezone,
        northStarGoal: input.northStarGoal,
        rawMessage: userMessageForAgent,
        intent: "GENERAL",
        memoryBlock,
        pillar: pillarRoute.pillar,
        department: pillarRoute.department,
      });
      return {
        replyText: research.text,
        intent,
        delegatedAgent: "Research",
        agentMetadata: {
          ...research.metadata,
          ...slashMetadata(slashRoute),
        },
      };
    }
    return {
      replyText: await answerGeneral(userMessageForAgent, memoryBlock),
      intent,
    };
  }

  const ctx: AgentContext = {
    userProfileId: input.userProfileId,
    telegramUserId: input.telegramUserId,
    timezone: input.timezone,
    northStarGoal: input.northStarGoal,
    rawMessage: userMessageForAgent,
    intent,
    memoryBlock,
    pillar: pillarRoute.pillar,
    department: pillarRoute.department,
  };

  const delegated = await dispatchToAgent(ctx, intent);
  if (delegated) {
    return {
      replyText: delegated.result.text,
      intent,
      delegatedAgent: delegated.agentName,
      agentMetadata: {
        ...delegated.result.metadata,
        ...slashMetadata(slashRoute),
      },
    };
  }

  return {
    replyText: routingPlaceholder(intent),
    intent,
    agentMetadata: {
      pillar: pillarRoute.pillar,
      department: pillarRoute.department,
      routing_placeholder: true,
      ...slashMetadata(slashRoute),
    },
  };
}
