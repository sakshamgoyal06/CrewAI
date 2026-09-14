import type { KiteHolding, KiteMfHolding, KiteMfSip, KitePortfolioSnapshot } from "./types.js";

function inr(n: number): string {
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function holdingValue(h: KiteHolding | KiteMfHolding): number {
  return (h.quantity ?? 0) * (h.last_price ?? 0);
}

export function formatKitePortfolioForPrompt(
  snapshot: KitePortfolioSnapshot,
  options?: { maxChars?: number },
): string {
  const maxChars = options?.maxChars ?? 3500;
  const lines: string[] = ["Zerodha (Kite Connect) — read-only snapshot:"];

  if (snapshot.profile?.user_name) {
    lines.push(`Account: ${snapshot.profile.user_name} (${snapshot.profile.user_id ?? "?"})`);
  }

  const cash =
    snapshot.margins?.equity?.available?.live_balance ??
    snapshot.margins?.equity?.available?.cash ??
    snapshot.margins?.equity?.net;
  if (cash != null && Number.isFinite(cash)) {
    lines.push(`Available cash (equity): ${inr(cash)}`);
  }

  const equityTotal = snapshot.holdings.reduce((sum, h) => sum + holdingValue(h), 0);
  const mfTotal = snapshot.mfHoldings.reduce((sum, h) => sum + holdingValue(h), 0);
  if (snapshot.holdings.length || snapshot.mfHoldings.length) {
    lines.push(
      `Approx portfolio: equity ${inr(equityTotal)} (${snapshot.holdings.length} stocks) + MF ${inr(mfTotal)} (${snapshot.mfHoldings.length} funds)`,
    );
  }

  if (snapshot.holdings.length) {
    lines.push("", "Equity holdings:");
    for (const h of snapshot.holdings.slice(0, 12)) {
      const val = holdingValue(h);
      const pnl = h.pnl ?? 0;
      const pnlSign = pnl >= 0 ? "+" : "";
      lines.push(
        `- ${h.tradingsymbol} (${h.exchange}): ${h.quantity} @ avg ${inr(h.average_price)}, last ${inr(h.last_price)} → ${inr(val)} (${pnlSign}${inr(pnl)})`,
      );
    }
    if (snapshot.holdings.length > 12) {
      lines.push(`- … and ${snapshot.holdings.length - 12} more`);
    }
  }

  if (snapshot.mfHoldings.length) {
    lines.push("", "Mutual fund holdings (Coin):");
    for (const h of snapshot.mfHoldings.slice(0, 10)) {
      const val = holdingValue(h);
      lines.push(
        `- ${h.fund}: ${h.quantity.toFixed(3)} units, NAV ${inr(h.last_price)} → ${inr(val)}`,
      );
    }
    if (snapshot.mfHoldings.length > 10) {
      lines.push(`- … and ${snapshot.mfHoldings.length - 10} more`);
    }
  }

  const activeSips = snapshot.mfSips.filter((s) => s.status === "ACTIVE");
  if (activeSips.length) {
    lines.push("", "Active SIPs:");
    for (const s of activeSips.slice(0, 8)) {
      lines.push(
        `- ${s.fund}: ${inr(s.instalment_amount)}/${s.frequency}${s.next_instalment ? `, next ${s.next_instalment}` : ""}`,
      );
    }
  }

  lines.push(
    "",
    "Note: Kite access tokens expire daily (~6 AM IST). Magnus does not place trades or give buy/sell calls.",
  );

  let out = lines.join("\n");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 20)}\n… (truncated)`;
  }
  return out;
}

export function summarizeKiteSips(sips: KiteMfSip[]): string {
  const active = sips.filter((s) => s.status === "ACTIVE");
  if (!active.length) {
    return "No active SIPs.";
  }
  const monthly = active
    .filter((s) => s.frequency === "monthly")
    .reduce((sum, s) => sum + (s.instalment_amount ?? 0), 0);
  return `${active.length} active SIP(s)${monthly ? `; ~${inr(monthly)}/month in monthly SIPs` : ""}.`;
}
