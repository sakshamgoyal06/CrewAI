/**
 * Tool loop for pillar specialists with shared operations tools.
 */
import type {
  Message,
  MessageParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { buildAgentMessages } from "../memory/memoryAgent.js";
import { buildSpecialistIdentity } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";
import { OPERATIONS_TOOLS, runOperationsTool } from "../magnusAgent.js";
import { classifyToolResult, type ToolOutcome } from "../routing/actionIntegrity.js";
import { PILLAR_MODEL } from "../pillarSpecialist.js";

const DEFAULT_MAX_ROUNDS = Math.min(
  Math.max(Number.parseInt(process.env.MAGNUS_PILLAR_TOOL_ROUNDS ?? "6", 10) || 6, 2),
  12,
);

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function toolUses(msg: Message): ToolUseBlock[] {
  return msg.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

const OPS_TOOLS_GUARD =
  "\n\n**Operations tools:** You may use calendar, lists, event log, journal, and LifeOS tools when the user asks for scheduling, tracking, or logging. Never claim a write succeeded unless the tool returned success.";

export type RunAgentWithToolsInput = {
  ctx: AgentContext;
  system: string;
  specialist: string;
  pillar: string;
  /** Intent label for action ledger — HEALTH, WISDOM, etc. */
  agent: string;
  capability?: string;
  allowedToolNames?: string[];
  maxTokens?: number;
  maxRounds?: number;
  enableOpsTools?: boolean;
};

export async function runAgentWithTools(input: RunAgentWithToolsInput): Promise<AgentResult> {
  const enableOps = input.enableOpsTools !== false;
  if (!enableOps) {
    const { runPillarSpecialist } = await import("../pillarSpecialist.js");
    return runPillarSpecialist({
      ctx: input.ctx,
      system: input.system,
      specialist: input.specialist,
      pillar: input.pillar,
      maxTokens: input.maxTokens,
      enableOpsTools: false,
    });
  }

  const allowed = input.allowedToolNames;
  const tools =
    allowed === undefined
      ? OPERATIONS_TOOLS
      : OPERATIONS_TOOLS.filter((t) => "name" in t && allowed.includes(String(t.name)));

  const messages: MessageParam[] = buildAgentMessages(
    input.ctx,
    input.ctx.rawMessage,
  );

  const toolsUsed: string[] = [];
  const toolOutcomes: ToolOutcome[] = [];
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;

  for (let round = 0; round < maxRounds; round += 1) {
    const msg = await anthropic.messages.create({
      model: PILLAR_MODEL,
      max_tokens: input.maxTokens ?? 768,
      system: `${buildSpecialistIdentity(input.ctx)}\n\n${input.system}${OPS_TOOLS_GUARD}`,
      tools,
      messages,
    });

    const uses = toolUses(msg);
    if (uses.length === 0) {
      return {
        text: textFromMessage(msg).trim() || "…",
        metadata: {
          specialist: input.specialist,
          pillar: input.pillar,
          delegated_agent: input.agent,
          pillar_capability: input.capability,
          prompt_only: false,
          pillar_compose: true,
          ...(toolsUsed.length > 0 ? { tools_used: toolsUsed } : {}),
          ...(toolOutcomes.length > 0 ? { tool_outcomes: toolOutcomes } : {}),
        },
      };
    }

    messages.push({ role: "assistant", content: msg.content });
    const results = [];
    for (const use of uses) {
      toolsUsed.push(use.name);
      const out = await runOperationsTool(
        use.name,
        (use.input ?? {}) as Record<string, unknown>,
        input.ctx,
      );
      toolOutcomes.push({
        name: use.name,
        ok: classifyToolResult(out),
        preview: out.slice(0, 160),
      });
      results.push({
        type: "tool_result" as const,
        tool_use_id: use.id,
        content: out,
      });
    }
    messages.push({ role: "user", content: results });
  }

  logger.warn(
    { agent: input.agent, toolsUsed, rounds: maxRounds },
    "pillar agent hit tool round limit",
  );

  return {
    text:
      `I hit the step limit on that request. Say "continue" or ask for one smaller step at a time.`,
    metadata: {
      specialist: input.specialist,
      pillar: input.pillar,
      delegated_agent: input.agent,
      tool_limit: true,
      tools_used: toolsUsed,
      tool_outcomes: toolOutcomes,
      pillar_compose: true,
    },
  };
}
