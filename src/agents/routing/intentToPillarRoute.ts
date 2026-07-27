import type { Intent } from "../../intent.js";

import type { PillarRoute } from "./pillarTypes.js";

/**
 * Intent to pillar. One department per pillar now that each pillar is a single agent — the
 * department field survives only as a label on stored metadata.
 */
export function intentToPillarRoute(intent: Intent): PillarRoute {
  switch (intent) {
    case "HEALTH":
      return { pillar: "health", department: "nutrition" };
    case "WEALTH":
      return { pillar: "wealth", department: "net_worth_balance_sheet" };
    case "HAPPINESS":
      return { pillar: "joy", department: "culture_leisure" };
    case "WISDOM":
      return { pillar: "wisdom", department: "learning_plan_development" };
    case "GENERAL":
      return { pillar: "wisdom", department: "tracking_habits" };
  }
}
