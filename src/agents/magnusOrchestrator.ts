import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "../intent.js";
import { logger } from "../logger.js";
import { anthropic } from "../tools/clients.js";
import { runResearchAgent } from "./intelligence/researchAgent.js";
import { isResearchSubIntent } from "./intelligence/researchRouting.js";
import { isNotionIntentOverride } from "./knowledge/notionIntent.js";
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
import type { AgentContext } from "./types.js";

const MODEL = "claude-sonnet-4-6";

const CLASSIFY_SYSTEM = `You are MAGNUS, a personal AI chief of staff. Classify the intent of the user message into exactly one category:
HEALTH | WEALTH | BUILD | PLANNING | RELATIONSHIPS | LEARNING | HAPPINESS | NOTION | GENERAL
Use NOTION when the user wants to log, create, or query something in Notion (pages, Goals DB, check-ins, patterns, briefs).
Use GENERAL when the user asks to research, compare, summarize, or look up external information (even if the topic touches planning or wealth).
Reply with only the category name, nothing else.`;

const GENERAL_SYSTEM =
  "You are MAGNUS, a warm and direct personal AI chief of staff for Saksham. Keep replies under 100 words.";

export type OrchestratorReply = {
  replyText: string;
  intent: Intent;
  delegatedAgent?: string;
  agentMetadata?: Record<string, unknown>;
};

/** Fired as soon as Magnus commits to a specialist — before memory load and before any specialist LLM work. */
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

async function classifyIntent(userMessage: string): Promise<Intent> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 64,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });
  return parseIntent(textFromMessage(msg));
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

/**
 * Classify → (optional progress callback) → memory → delegate or general reply.
 */
export async function runOrchestratorReply(input: {
  userMessage: string;
  userProfileId: string;
  telegramUserId: string;
  timezone?: string;
  northStarGoal?: string;
  /** Answer to planning-vs-research disambiguation ("1" = Planner, "2" = Research). Skips classify. */
  disambiguationChoice?: "1" | "2";
  /** Called once a specialist is chosen, before memory load and before that specialist runs. */
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
    return {
      replyText: ob.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: ob.metadata,
    };
  }

  let intent: Intent;

  if (input.disambiguationChoice === "1") {
    intent = "PLANNING";
  } else if (input.disambiguationChoice === "2") {
    intent = "GENERAL";
  } else {
    intent = isNotionIntentOverride(input.userMessage)
      ? "NOTION"
      : isMealCommand(input.userMessage)
        ? "HEALTH"
        : await classifyIntent(input.userMessage);

    /** Classifier often picks PLANNING for "research X" queries; route those to Research instead of Planner. */
    if (
      intent !== "NOTION" &&
      intent !== "HEALTH" &&
      isResearchSubIntent(input.userMessage)
    ) {
      intent = "GENERAL";
    }
  }

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
    return {
      replyText: started.text,
      intent: "HEALTH",
      delegatedAgent: "HealthOnboarding",
      agentMetadata: started.metadata,
    };
  }

  const willResearch =
    intent === "GENERAL" &&
    (input.disambiguationChoice === "2" ||
      isResearchSubIntent(input.userMessage));
  const specialistForIntent =
    intent === "GENERAL" ? null : findAgentForIntent(intent);

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
        rawMessage: input.userMessage,
        intent: "GENERAL",
        memoryBlock,
      });
      return {
        replyText: research.text,
        intent,
        delegatedAgent: "Research",
        agentMetadata: research.metadata,
      };
    }
    return {
      replyText: await answerGeneral(input.userMessage, memoryBlock),
      intent,
    };
  }

  const ctx: AgentContext = {
    userProfileId: input.userProfileId,
    telegramUserId: input.telegramUserId,
    timezone: input.timezone,
    northStarGoal: input.northStarGoal,
    rawMessage: input.userMessage,
    intent,
    memoryBlock,
  };

  const delegated = await dispatchToAgent(ctx, intent);
  if (delegated) {
    return {
      replyText: delegated.result.text,
      intent,
      delegatedAgent: delegated.agentName,
      agentMetadata: delegated.result.metadata,
    };
  }

  return {
    replyText: routingPlaceholder(intent),
    intent,
  };
}
