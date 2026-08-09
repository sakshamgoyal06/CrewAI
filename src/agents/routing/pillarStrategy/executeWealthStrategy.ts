/**
 * Execute a parsed WEALTH pillar strategy — loads portfolio context and runs the matching pipeline.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../../tools/clients.js";
import { buildAgentMessages } from "../../memory/memoryAgent.js";
import { buildSpecialistIdentity } from "../../promptIdentity.js";
import { PILLAR_MODEL } from "../../pillarSpecialist.js";
import { connectKiteTool } from "../../tools/kiteConnectTool.js";
import type { AgentContext, AgentResult } from "../../types.js";
import {
  fetchKitePortfolioSnapshot,
  formatKitePortfolioForPrompt,
} from "../../../pillars/wealth/zerodha/index.js";
import { WEALTH_SYSTEM } from "../../wealth/wealthAgent.js";
import type { PillarStrategy } from "./types.js";
import { withPillarStrategyMeta } from "./withStrategyMeta.js";

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function optionalProfileBlock(ctx: AgentContext): string {
  const parts: string[] = [];
  if (ctx.northStarGoal?.trim()) {
    parts.push(`North star (from profile): ${ctx.northStarGoal.trim()}`);
  }
  if (ctx.timezone?.trim()) {
    parts.push(`Timezone (from profile): ${ctx.timezone.trim()}`);
  }
  return parts.length === 0 ? "" : `\n\n${parts.join("\n")}`;
}

async function loadKiteContextBlock(userProfileId: string): Promise<{
  block: string;
  meta: Record<string, unknown>;
}> {
  const res = await fetchKitePortfolioSnapshot(userProfileId);
  if (!res.ok) {
    if (res.error === "not_connected") {
      return {
        block:
          '\n\nZerodha: not connected. User can say "connect Zerodha" for a login link (read-only portfolio).',
        meta: res.meta,
      };
    }
    if (res.error === "token_expired") {
      return {
        block:
          '\n\nZerodha: access token expired (Kite tokens reset daily ~6 AM IST). Ask user to say "connect Zerodha" to refresh.',
        meta: res.meta,
      };
    }
    return {
      block: `\n\nZerodha: could not load portfolio (${res.error}).`,
      meta: res.meta,
    };
  }

  const formatted = formatKitePortfolioForPrompt(res.snapshot);
  return {
    block: formatted ? `\n\n${formatted}` : "",
    meta: res.meta,
  };
}

async function runWealthCoaching(ctx: AgentContext): Promise<AgentResult> {
  const { block: kiteBlock, meta: kiteMeta } = await loadKiteContextBlock(ctx.userProfileId);

  const msg = await anthropic.messages.create({
    model: PILLAR_MODEL,
    max_tokens: 768,
    system: `${buildSpecialistIdentity(ctx)}\n\n${WEALTH_SYSTEM}`,
    messages: buildAgentMessages(
      ctx,
      `${ctx.rawMessage}${optionalProfileBlock(ctx)}${kiteBlock}`,
    ),
  });

  return {
    text: textFromMessage(msg).trim() || "…",
    metadata: {
      specialist: "Wealth",
      pillar: "wealth",
      ...kiteMeta,
    },
  };
}

export async function executeWealthStrategy(
  ctx: AgentContext,
  strategy: PillarStrategy,
): Promise<AgentResult> {
  if (strategy.capability === "kite_connect") {
    const text = await connectKiteTool({
      userProfileId: ctx.userProfileId,
      telegramUserId: ctx.telegramUserId,
    });
    return withPillarStrategyMeta(
      {
        text,
        metadata: {
          specialist: "Wealth",
          pillar: "wealth",
          kite_connect: true,
        },
      },
      strategy,
      "pillar_strategy",
    );
  }

  const result = await runWealthCoaching(ctx);
  return withPillarStrategyMeta(result, strategy, "pillar_strategy");
}
