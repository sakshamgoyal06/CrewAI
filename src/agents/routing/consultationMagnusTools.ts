/**
 * During pillar_consultation, Magnus only gets tools the user message actually needs.
 * Capability list comes from the routing context parser — no regex.
 */
import { GENERAL_CAPABILITY_TOOLS } from "./pillarStrategy/catalogs/generalCatalog.js";
import type { MagnusRoutingCapability } from "./routingContextParser.js";

const CAPABILITY_ALIASES: Record<MagnusRoutingCapability, string[]> = {
  calendar: ["calendar"],
  youtube: ["youtube"],
  lists: ["lists"],
  event_log: ["event_log"],
  journal: ["journal"],
  proactive: ["proactive"],
  lifeos: ["lifeos"],
  notion: ["notion"],
  connect: ["calendar", "youtube", "notion"],
};

function addTools(set: Set<string>, capability: string): void {
  for (const name of GENERAL_CAPABILITY_TOOLS[capability] ?? []) {
    set.add(name);
  }
}

/** Tool names Magnus may use on a pillar_consultation turn (empty = no tools). */
export function magnusAllowedToolsForConsultation(
  magnusCapabilities: MagnusRoutingCapability[],
): string[] {
  const allowed = new Set<string>();

  for (const cap of magnusCapabilities) {
    for (const mapped of CAPABILITY_ALIASES[cap] ?? [cap]) {
      addTools(allowed, mapped);
    }
  }

  return [...allowed];
}
