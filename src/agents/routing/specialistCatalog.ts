/**
 * Specialist catalog: stable string keys (`{pillar}:{department}`) → async runners.
 *
 * Full wiring of every specialist implementation and orchestrator dispatch through this
 * map is a follow-up; this file only establishes compile-time shape and one legacy Planner
 * entry (`wisdom:planning_legacy`) using imports that avoid circular dependencies with
 * `registry` / orchestrator.
 */

import { runPlannerAgent } from "../planning/plannerAgent.js";
import type { AgentContext, AgentResult } from "../types.js";
import type { DepartmentId, Pillar } from "./pillarTypes.js";
import { pillarForDepartment } from "./pillarTypes.js";

/** Canonical routing id: pillar plus `snake_case` department (see `DepartmentId`). */
export type SpecialistKey = `${Pillar}:${DepartmentId}` | "wisdom:planning_legacy";

export type SpecialistRunner = (ctx: AgentContext) => Promise<AgentResult>;

function specialistNotImplemented(key: SpecialistKey): SpecialistRunner {
  return async () => {
    throw new Error(`Specialist not implemented: ${key}`);
  };
}

const DEPARTMENTS: DepartmentId[] = [
  "nutrition",
  "workouts",
  "long_term_health_planning",
  "trading",
  "investment",
  "long_term_financial_planning",
  "net_worth_balance_sheet",
  "fire_independence_goals",
  "learning_plan_development",
  "tracking_habits",
  "build_ship",
  "relationships",
  "adventure_trips",
  "culture_leisure",
];

function specialistKeyForDepartment(department: DepartmentId): `${Pillar}:${DepartmentId}` {
  return `${pillarForDepartment(department)}:${department}`;
}

const canonicalRunners = Object.fromEntries(
  DEPARTMENTS.map((department) => {
    const key = specialistKeyForDepartment(department);
    return [key, specialistNotImplemented(key)] as const;
  }),
) as Record<`${Pillar}:${DepartmentId}`, SpecialistRunner>;

/**
 * Placeholder dispatch table. Most entries throw until wired; `wisdom:planning_legacy`
 * delegates to the existing Planner specialist (`runPlannerAgent`).
 */
export const SPECIALIST_RUNNERS: Record<SpecialistKey, SpecialistRunner> = {
  ...canonicalRunners,
  "wisdom:planning_legacy": runPlannerAgent,
};
