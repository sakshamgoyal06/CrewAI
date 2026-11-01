/**
 * LifeOS domain tables (goals, pillar_status, happiness_reserve, patterns, …) are optional context.
 * Default off — enable when tables are populated and writers exist.
 */
export function lifeosContextEnabled(): boolean {
  const raw = process.env.MAGNUS_LIFEOS_CONTEXT_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
