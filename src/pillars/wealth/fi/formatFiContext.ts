import type { FiWealthSnapshot } from "./types.js";
import { fiMoneyToInr } from "./fiMoney.js";

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Compact Fi wealth block for the wealth agent system context. */
export function formatFiWealthForPrompt(snapshot: FiWealthSnapshot): string {
  const lines: string[] = ["Fi Money (banks, cards, loans, investments — read-only):"];

  const total = snapshot.netWorth?.totalNetWorth
    ? fiMoneyToInr(snapshot.netWorth.totalNetWorth)
    : undefined;
  if (total != null) {
    lines.push(`Net worth: ${inr(Math.round(total))}`);
  }

  if (snapshot.netWorth?.assets?.length) {
    lines.push("Assets:");
    for (const a of snapshot.netWorth.assets.slice(0, 8)) {
      lines.push(`  • ${a.label}: ${inr(a.valueInr)}`);
    }
  }

  if (snapshot.netWorth?.liabilities?.length) {
    lines.push("Liabilities:");
    for (const l of snapshot.netWorth.liabilities.slice(0, 6)) {
      lines.push(`  • ${l.label}: ${inr(l.valueInr)}`);
    }
  }

  if (snapshot.creditScore) {
    lines.push(`Credit score (bureau): ${snapshot.creditScore}`);
  }

  if (snapshot.creditAccounts?.length) {
    lines.push("Credit accounts (from report):");
    for (const c of snapshot.creditAccounts.slice(0, 6)) {
      const parts = [c.subscriber ?? "Card/loan"];
      if (c.currentBalance != null) {
        parts.push(`bal ${inr(Math.round(c.currentBalance))}`);
      }
      if (c.creditLimit != null) {
        parts.push(`limit ${inr(Math.round(c.creditLimit))}`);
      }
      lines.push(`  • ${parts.join(" — ")}`);
    }
  }

  if (snapshot.bankTransactions?.length) {
    lines.push(`Recent bank transactions (last ~2 months, ${snapshot.bankTransactions.length} rows):`);
    for (const t of snapshot.bankTransactions.slice(0, 12)) {
      const sign = t.type === "CREDIT" ? "+" : "-";
      lines.push(
        `  • ${t.date} ${sign}${inr(Math.round(Math.abs(t.amount)))} ${t.bank}: ${t.narration.slice(0, 60)}`,
      );
    }
  }

  return lines.join("\n");
}
