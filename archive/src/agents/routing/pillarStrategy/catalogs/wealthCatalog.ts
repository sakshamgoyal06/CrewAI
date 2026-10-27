import type { CapabilityCatalog } from "../types.js";

export const WEALTH_CAPABILITY_CATALOG: CapabilityCatalog = {
  pillar: "WEALTH",
  capabilities: [
    {
      id: "kite_connect",
      summary: "Start Zerodha/Kite OAuth link for read-only portfolio",
      disambiguation: 'connect/link/login/reconnect Zerodha or Kite.',
    },
    {
      id: "coaching",
      summary: "Budgeting, saving, investing philosophy, portfolio discussion",
      disambiguation: "Default for money questions. Portfolio numbers loaded in executor, not parser.",
    },
  ],
};

export const WEALTH_CAPABILITY_IDS = WEALTH_CAPABILITY_CATALOG.capabilities.map((c) => c.id);
