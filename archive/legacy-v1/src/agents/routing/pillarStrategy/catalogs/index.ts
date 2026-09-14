import { filterCapabilityCatalog } from "../../../../config/minimalMode.js";
import type { PillarId } from "../types.js";
import type { CapabilityCatalog } from "../types.js";
import { GENERAL_CAPABILITY_CATALOG } from "./generalCatalog.js";
import { HEALTH_CAPABILITY_CATALOG } from "./healthCatalog.js";
import { HAPPINESS_CAPABILITY_CATALOG } from "./happinessCatalog.js";
import { WEALTH_CAPABILITY_CATALOG } from "./wealthCatalog.js";
import { WISDOM_CAPABILITY_CATALOG } from "./wisdomCatalog.js";

const CATALOGS: Record<PillarId, CapabilityCatalog> = {
  HEALTH: HEALTH_CAPABILITY_CATALOG,
  WEALTH: WEALTH_CAPABILITY_CATALOG,
  HAPPINESS: HAPPINESS_CAPABILITY_CATALOG,
  WISDOM: WISDOM_CAPABILITY_CATALOG,
  GENERAL: GENERAL_CAPABILITY_CATALOG,
};

export function getCapabilityCatalog(pillar: PillarId): CapabilityCatalog {
  return filterCapabilityCatalog(CATALOGS[pillar]);
}

export function isValidCapability(pillar: PillarId, capability: string): boolean {
  return getCapabilityCatalog(pillar).capabilities.some((c) => c.id === capability);
}

export function formatCatalogForPrompt(catalog: CapabilityCatalog): string {
  return catalog.capabilities
    .map((c) => `- **${c.id}**: ${c.summary}\n  _Pick when:_ ${c.disambiguation}`)
    .join("\n");
}
