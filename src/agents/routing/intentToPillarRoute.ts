import type { Intent } from "../../intent.js";

import type { DepartmentId, PillarRoute } from "./pillarTypes.js";
import { pillarForDepartment } from "./pillarTypes.js";

/**
 * Best-effort routing from high-level {@link Intent} to a {@link PillarRoute}.
 * Departments use the stable snake_case IDs from `pillarTypes` / AGENT_ARCHITECTURE.
 */
export function intentToPillarRoute(intent: Intent): PillarRoute {
  switch (intent) {
    // Default health surface: nutrition is the primary entry for day-to-day health work.
    case "HEALTH":
      return { pillar: "health", department: "nutrition" };
    // Active wealth: trading copilot as the default specialist touchpoint.
    case "WEALTH":
      return { pillar: "wealth", department: "trading" };
    // Execution and “ship” work: projects, systems, delivery.
    case "BUILD":
      return { pillar: "wisdom", department: "build_ship" };
    // Strategic planning and roadmaps: same wisdom lane as execution planning.
    case "PLANNING":
      return { pillar: "wisdom", department: "build_ship" };
    // Social pillar default.
    case "RELATIONSHIPS":
      return { pillar: "joy", department: "relationships" };
    // Study and skill development.
    case "LEARNING":
      return { pillar: "wisdom", department: "learning_plan_development" };
    // Trips, itineraries, travel-style joy (AGENT_ARCHITECTURE §3.4 — Adventure & trips).
    case "HAPPINESS":
      return { pillar: "joy", department: "adventure_trips" };
    // Media, events, and cultural picks.
    case "CULTURE":
      return { pillar: "joy", department: "culture_leisure" };
    // Knowledge base / second brain: closest fit is structured learning and plans.
    case "NOTION":
      return { pillar: "wisdom", department: "learning_plan_development" };
    // Unclassified traffic: neutral “life systems” lane until disambiguated.
    case "GENERAL":
      return { pillar: "wisdom", department: "tracking_habits" };
  }
}


/**
 * Pillar route for a turn: optional slash-selected {@link DepartmentId} overrides
 * {@link intentToPillarRoute}(intent) for granular routing (e.g. `/invest` vs `/wealth`).
 */
export function resolvePillarRoute(
  intent: Intent,
  slashDepartment?: DepartmentId,
): PillarRoute {
  if (slashDepartment !== undefined) {
    return {
      pillar: pillarForDepartment(slashDepartment),
      department: slashDepartment,
    };
  }
  return intentToPillarRoute(intent);
}
