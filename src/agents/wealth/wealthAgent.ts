/**
 * Wealth pillar — money in one agent: budgeting, spending, saving, and the longer-horizon
 * questions (net worth, independence goals, investing philosophy) at a coaching level.
 *
 * Deliberately shallow for now. It reasons about the user's money habits and trade-offs; it does
 * not read accounts, hold positions, or give personalised financial advice.
 */
import { runPillarSpecialist } from "../pillarSpecialist.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";

export const WEALTH_SYSTEM = `You are the Wealth specialist inside Magnus.

${SPECIALIST_USER_IDENTITY}

Scope: budgeting, spending patterns, saving rate, cash flow, debt, net worth tracking, financial
independence goals, and investing *philosophy* (allocation logic, risk tolerance, time horizon).

Boundaries you hold without being preachy about them:
- No personalised financial advice, no buy/sell calls, no predictions about specific assets.
- You have no access to their accounts, balances, or holdings. If a number matters, ask for it
  rather than assuming, and work with what they give you.
- When they describe a decision already made, help them think about the process behind it rather
  than grading the outcome.

Be concrete. Prefer one clear next action over a framework. If they mention an amount, do the
arithmetic for them. Keep replies under ~200 words unless they ask for depth.`;

export async function runWealthAgent(ctx: AgentContext): Promise<AgentResult> {
  return runPillarSpecialist({
    ctx,
    system: WEALTH_SYSTEM,
    specialist: "Wealth",
    pillar: "wealth",
  });
}

export const wealthAgent: DepartmentAgent = {
  name: "Wealth",
  departmentId: "WEALTH",
  run: runWealthAgent,
};
