/**
 * Wealth pillar — money coaching with optional Zerodha (Kite Connect) portfolio context.
 *
 * Read-only broker data: equity holdings, Coin MF holdings/SIPs, available cash.
 * No order placement, no buy/sell advice.
 */
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import { buildRoutingHints } from "../routing/pillarStrategy/buildRoutingHints.js";
import { executeWealthStrategy } from "../routing/pillarStrategy/executeWealthStrategy.js";
import { parsePillarExecutionPlan } from "../routing/pillarStrategy/parsePillarStrategy.js";

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

export async function runWealthAgent(ctx: AgentContext): Promise<AgentResult> {
  const hints = await buildRoutingHints(ctx);
  const plan = await parsePillarExecutionPlan("WEALTH", ctx.rawMessage, hints);
  return executeWealthStrategy({ ...ctx, pillarStrategy: plan }, plan);
}

export const wealthAgent: DepartmentAgent = {
  name: "Wealth",
  departmentId: "WEALTH",
  run: runWealthAgent,
};
