/**
 * Routing identifiers for pillars and departments (see `docs/AGENT_ARCHITECTURE.md` §3).
 *
 * **Department IDs use `snake_case`** — stable, URL- and log-friendly string literals (not display titles).
 */

export type Pillar = "health" | "wealth" | "wisdom" | "joy";

/** Departments from AGENT_ARCHITECTURE §3.1–3.4, as snake_case IDs. */
export type DepartmentId =
  // Health
  | "nutrition"
  | "workouts"
  | "long_term_health_planning"
  // Wealth
  | "trading"
  | "investment"
  | "long_term_financial_planning"
  | "net_worth_balance_sheet"
  | "fire_independence_goals"
  // Wisdom
  | "learning_plan_development"
  | "tracking_habits"
  | "build_ship"
  // Joy
  | "relationships"
  | "adventure_trips"
  | "culture_leisure";

export type PillarRoute = { pillar: Pillar; department: string };

export function isPillar(value: string): value is Pillar {
  return (
    value === "health" ||
    value === "wealth" ||
    value === "wisdom" ||
    value === "joy"
  );
}

export function isDepartmentId(value: string): value is DepartmentId {
  switch (value) {
    case "nutrition":
    case "workouts":
    case "long_term_health_planning":
    case "trading":
    case "investment":
    case "long_term_financial_planning":
    case "net_worth_balance_sheet":
    case "fire_independence_goals":
    case "learning_plan_development":
    case "tracking_habits":
    case "build_ship":
    case "relationships":
    case "adventure_trips":
    case "culture_leisure":
      return true;
    default:
      return false;
  }
}

/** Maps each department to its pillar (AGENT_ARCHITECTURE §3). */
export function pillarForDepartment(department: DepartmentId): Pillar {
  switch (department) {
    case "nutrition":
    case "workouts":
    case "long_term_health_planning":
      return "health";
    case "trading":
    case "investment":
    case "long_term_financial_planning":
    case "net_worth_balance_sheet":
    case "fire_independence_goals":
      return "wealth";
    case "learning_plan_development":
    case "tracking_habits":
    case "build_ship":
      return "wisdom";
    case "relationships":
    case "adventure_trips":
    case "culture_leisure":
      return "joy";
  }
}
