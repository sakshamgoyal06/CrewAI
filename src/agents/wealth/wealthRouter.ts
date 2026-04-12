import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";
import type { DepartmentId } from "../routing/pillarTypes.js";
import { runFireGoalsAgent } from "./fireGoalsAgent.js";
import { runInvestmentAnalystAgent } from "./investmentAnalystAgent.js";
import { runLongTermFinancialPlanningAgent } from "./longTermFinancialPlanningAgent.js";
import { runNetWorthAgent } from "./netWorthAgent.js";
import { runTradingCopilotAgent } from "./tradingCopilotAgent.js";

/**
 * Routes `WEALTH` by `AgentContext.department` (from slash or default `trading`).
 */
export async function routeWealthMessage(ctx: AgentContext): Promise<AgentResult> {
  const d = (ctx.department ?? "trading") as DepartmentId;
  switch (d) {
    case "investment":
      return runInvestmentAnalystAgent(ctx);
    case "long_term_financial_planning":
      return runLongTermFinancialPlanningAgent(ctx);
    case "net_worth_balance_sheet":
      return runNetWorthAgent(ctx);
    case "fire_independence_goals":
      return runFireGoalsAgent(ctx);
    case "trading":
    default:
      return runTradingCopilotAgent(ctx);
  }
}

export const wealthCompositeAgent: DepartmentAgent = {
  name: "WealthComposite",
  departmentId: "WEALTH",
  run: routeWealthMessage,
};
