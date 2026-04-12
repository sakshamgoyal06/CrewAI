import type { DepartmentAgent } from "../types.js";

/**
 * Temporary stub until the full Planner (`planning/plannerAgent.ts`) is the default (Prompt 5).
 * Fixed reply keeps orchestration tests deterministic without Claude.
 */
export const plannerStubAgent: DepartmentAgent = {
  name: "Planner",
  departmentId: "PLANNING",
  async run() {
    return {
      text: "[Planner stub] Specialist routing is wired; full Planner lands in Prompt 5.",
      metadata: { stub: true, department: "PLANNING" },
    };
  },
};
