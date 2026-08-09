/**
 * Wealth pillar — money coaching with optional Zerodha (Kite Connect) portfolio context.
 *
 * Read-only broker data: equity holdings, Coin MF holdings/SIPs, available cash.
 * No order placement, no buy/sell advice.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import { buildAgentMessages } from "../memory/memoryAgent.js";
import { buildSpecialistIdentity } from "../promptIdentity.js";
import { PILLAR_MODEL } from "../pillarSpecialist.js";
import { connectKiteTool, isKiteConnectRequest } from "../tools/kiteConnectTool.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import {
  fetchKitePortfolioSnapshot,
  formatKitePortfolioForPrompt,
} from "../../pillars/wealth/zerodha/index.js";
import { buildRoutingHints } from "../routing/pillarStrategy/buildRoutingHints.js";
import { executeWealthStrategy } from "../routing/pillarStrategy/executeWealthStrategy.js";
import { parsePillarExecutionPlan, pillarStrategyEnabled } from "../routing/pillarStrategy/parsePillarStrategy.js";

export const WEALTH_SYSTEM = `You are the Wealth specialist inside Magnus.

Scope: budgeting, spending patterns, saving rate, cash flow, debt, net worth tracking, financial
independence goals, and investing *philosophy* (allocation logic, risk tolerance, time horizon).

When Zerodha (Kite Connect) context is attached below, use those numbers for holdings, SIPs, and
cash — do not invent balances. Summarise allocation and drift in plain language. If context says
not connected or token expired, tell them to say "connect Zerodha" for a fresh login link.

Magnus is read-only on Zerodha today (no orders). Do not offer to place trades or MF orders.

Boundaries you hold without being preachy about them:
- No personalised financial advice, no buy/sell calls, no predictions about specific assets.
- Magnus does not place trades. You cannot execute orders on their behalf.
- When they describe a decision already made, help them think about the process behind it rather
  than grading the outcome.

Be concrete. Prefer one clear next action over a framework. If they mention an amount, do the
arithmetic for them. Keep replies under ~200 words unless they ask for depth.`;

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
  try {
    const res = await fetchKitePortfolioSnapshot(userProfileId);
    if (!res.ok) {
      if (res.error === "not_connected") {
        return {
          block:
            "\n\nZerodha: not connected. User can say \"connect Zerodha\" for a login link (read-only portfolio).",
          meta: res.meta,
        };
      }
      if (res.error === "token_expired") {
        return {
          block:
            "\n\nZerodha: access token expired (Kite tokens reset daily ~6 AM IST). Ask user to say \"connect Zerodha\" to refresh.",
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
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "wealth: kite context load failed");
    return {
      block: "",
      meta: { kite: "error", kite_error: e instanceof Error ? e.message : String(e) },
    };
  }
}

export async function runWealthAgent(ctx: AgentContext): Promise<AgentResult> {
  if (isKiteConnectRequest(ctx.rawMessage)) {
    const text = await connectKiteTool({
      userProfileId: ctx.userProfileId,
      telegramUserId: ctx.telegramUserId,
    });
    return {
      text,
      metadata: {
        specialist: "Wealth",
        pillar: "wealth",
        kite_connect: true,
      },
    };
  }

  if (pillarStrategyEnabled()) {
    const hints = await buildRoutingHints(ctx);
    const plan = await parsePillarExecutionPlan("WEALTH", ctx.rawMessage, hints);
    return executeWealthStrategy({ ...ctx, pillarStrategy: plan }, plan);
  }

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

export const wealthAgent: DepartmentAgent = {
  name: "Wealth",
  departmentId: "WEALTH",
  run: runWealthAgent,
};
