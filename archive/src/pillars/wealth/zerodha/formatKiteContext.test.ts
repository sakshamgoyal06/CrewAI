import { describe, expect, it } from "vitest";

import { formatKitePortfolioForPrompt } from "./formatKiteContext.js";
import type { KitePortfolioSnapshot } from "./types.js";

describe("formatKitePortfolioForPrompt", () => {
  it("formats holdings, MF, and SIP summary", () => {
    const snapshot: KitePortfolioSnapshot = {
      profile: { user_id: "AB1234", user_name: "Test User" },
      holdings: [
        {
          tradingsymbol: "INFY",
          exchange: "NSE",
          quantity: 10,
          average_price: 1500,
          last_price: 1600,
          pnl: 1000,
        },
      ],
      mfHoldings: [
        {
          tradingsymbol: "INF123",
          fund: "Test Fund Direct",
          quantity: 100,
          average_price: 50,
          last_price: 55,
          pnl: 500,
        },
      ],
      mfSips: [
        {
          sip_id: "1",
          tradingsymbol: "INF123",
          fund: "Test Fund Direct",
          status: "ACTIVE",
          instalment_amount: 5000,
          frequency: "monthly",
          next_instalment: "2026-08-10",
        },
      ],
      margins: { equity: { available: { live_balance: 25000 } } },
    };

    const s = formatKitePortfolioForPrompt(snapshot);
    expect(s).toContain("Zerodha (Kite Connect)");
    expect(s).toContain("Test User");
    expect(s).toContain("INFY");
    expect(s).toContain("Test Fund Direct");
    expect(s).toContain("Active SIPs");
    expect(s).toContain("does not place trades");
  });
});
