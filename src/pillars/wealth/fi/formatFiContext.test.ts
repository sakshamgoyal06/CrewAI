import { describe, expect, it } from "vitest";

import { formatFiWealthForPrompt } from "./formatFiContext.js";
import type { FiWealthSnapshot } from "./types.js";

describe("formatFiWealthForPrompt", () => {
  it("formats net worth, credit, and bank txns compactly", () => {
    const snapshot: FiWealthSnapshot = {
      netWorth: {
        totalNetWorth: { currencyCode: "INR", units: "1500000" },
        assets: [
          { label: "Mutual Funds", valueInr: 800000 },
          { label: "Savings", valueInr: 700000 },
        ],
        liabilities: [{ label: "Credit Card", valueInr: 50000 }],
      },
      creditScore: "780",
      creditAccounts: [
        {
          subscriber: "HDFC Bank",
          currentBalance: 12000,
          creditLimit: 200000,
        },
      ],
      bankTransactions: [
        {
          bank: "Federal Bank",
          amount: 2500,
          narration: "UPI-SWIGGY",
          date: "2026-08-01",
          type: "DEBIT",
        },
      ],
    };

    const out = formatFiWealthForPrompt(snapshot);
    expect(out).toContain("Fi Money");
    expect(out).toContain("₹15,00,000");
    expect(out).toContain("Mutual Funds");
    expect(out).toContain("Credit score (bureau): 780");
    expect(out).toContain("HDFC Bank");
    expect(out).toContain("SWIGGY");
  });

  it("handles empty snapshot with header only", () => {
    const out = formatFiWealthForPrompt({});
    expect(out).toContain("Fi Money");
    expect(out).not.toContain("Net worth:");
  });
});
