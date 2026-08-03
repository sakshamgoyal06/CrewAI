import type {
  FiBankTransaction,
  FiCreditAccount,
  FiMcpFetchResult,
  FiMoneyValue,
  FiNetWorthSnapshot,
  FiWealthSnapshot,
} from "./types.js";
import { fiMoneyToInr } from "./fiMoney.js";
import { fiMcpEnabled } from "./fiEnv.js";
import { callFiMcpTool, FI_MCP_TOOLS } from "./fiMcpClient.js";
import {
  getOrCreateFiMcpSessionId,
  isFiMcpAuthFresh,
  markFiMcpAuthenticated,
  getFiMcpAuthenticatedAt,
} from "./fiSession.js";

function humanizeAssetLabel(raw: string): string {
  return raw
    .replace(/^ASSET_TYPE_/, "")
    .replace(/^LIABILITY_TYPE_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseNetWorth(parsed: unknown): FiNetWorthSnapshot | undefined {
  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }
  const root = parsed as Record<string, unknown>;
  const nw = (root.netWorthResponse ?? root) as Record<string, unknown>;
  if (!nw || typeof nw !== "object") {
    return undefined;
  }

  const assets: FiNetWorthSnapshot["assets"] = [];
  const liabilities: FiNetWorthSnapshot["liabilities"] = [];

  for (const row of (nw.assetValues as unknown[]) ?? []) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    const label = humanizeAssetLabel(String(r.netWorthAttribute ?? "asset"));
    const valueInr = fiMoneyToInr(r.value as FiMoneyValue);
    if (valueInr != null) {
      assets.push({ label, valueInr: Math.round(valueInr) });
    }
  }

  for (const row of (nw.liabilityValues as unknown[]) ?? []) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    const label = humanizeAssetLabel(String(r.netWorthAttribute ?? "liability"));
    const valueInr = fiMoneyToInr(r.value as FiMoneyValue);
    if (valueInr != null) {
      liabilities.push({ label, valueInr: Math.round(valueInr) });
    }
  }

  const totalNetWorth = fiMoneyToInr(nw.totalNetWorthValue as FiMoneyValue);

  return {
    totalNetWorth:
      totalNetWorth != null
        ? { currencyCode: "INR", units: String(Math.round(totalNetWorth)) }
        : undefined,
    assets,
    liabilities,
  };
}

function parseBankTransactions(parsed: unknown): FiBankTransaction[] {
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const root = parsed as Record<string, unknown>;
  const banks = (root.bankTransactions as unknown[]) ?? [];
  const out: FiBankTransaction[] = [];

  for (const bankRow of banks) {
    if (!bankRow || typeof bankRow !== "object") {
      continue;
    }
    const bankName = String((bankRow as Record<string, unknown>).bank ?? "Bank");
    const txns = ((bankRow as Record<string, unknown>).txns as unknown[]) ?? [];
    for (const txn of txns) {
      if (!Array.isArray(txn) || txn.length < 4) {
        continue;
      }
      const amount = Number.parseFloat(String(txn[0]));
      const narration = String(txn[1] ?? "");
      const date = String(txn[2] ?? "");
      const typeCode = Number(txn[3]);
      const type =
        typeCode === 1
          ? "CREDIT"
          : typeCode === 2
            ? "DEBIT"
            : typeCode === 3
              ? "OPENING"
              : "OTHER";
      const balanceAfter = txn[6] != null ? Number.parseFloat(String(txn[6])) : undefined;
      if (!Number.isNaN(amount)) {
        out.push({
          bank: bankName,
          amount,
          narration,
          date,
          type,
          balanceAfter: balanceAfter != null && !Number.isNaN(balanceAfter) ? balanceAfter : undefined,
        });
      }
    }
  }

  return out.slice(0, 40);
}

function parseCreditReport(parsed: unknown): {
  creditScore?: string;
  creditAccounts: FiCreditAccount[];
} {
  if (!parsed || typeof parsed !== "object") {
    return { creditAccounts: [] };
  }
  const root = parsed as Record<string, unknown>;
  const reports = (root.creditReports as unknown[]) ?? [];
  const first = reports[0];
  if (!first || typeof first !== "object") {
    return { creditAccounts: [] };
  }
  const data = ((first as Record<string, unknown>).creditReportData ?? first) as Record<
    string,
    unknown
  >;
  const scoreObj = data.score as Record<string, unknown> | undefined;
  const creditScore =
    typeof scoreObj?.bureauScore === "string" || typeof scoreObj?.bureauScore === "number"
      ? String(scoreObj.bureauScore)
      : undefined;

  const accountRoot = data.creditAccount as Record<string, unknown> | undefined;
  const details = (accountRoot?.creditAccountDetails as unknown[]) ?? [];
  const creditAccounts: FiCreditAccount[] = [];

  for (const row of details) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    creditAccounts.push({
      subscriber: typeof r.subscriberName === "string" ? r.subscriberName : undefined,
      accountType: typeof r.accountType === "string" ? r.accountType : undefined,
      currentBalance: r.currentBalance != null ? Number.parseFloat(String(r.currentBalance)) : undefined,
      creditLimit:
        r.creditLimitAmount != null ? Number.parseFloat(String(r.creditLimitAmount)) : undefined,
      status: typeof r.accountStatus === "string" ? r.accountStatus : undefined,
    });
  }

  return { creditScore, creditAccounts };
}

async function fetchToolJson(
  sessionId: string,
  toolName: string,
): Promise<
  | { ok: true; parsed?: unknown; loginRequired?: { loginUrl: string; message?: string } }
  | { ok: false; error: string; loginRequired?: { loginUrl: string; message?: string } }
> {
  const res = await callFiMcpTool(sessionId, toolName);
  if (!res.ok) {
    return res;
  }
  if (res.loginRequired) {
    return { ok: false, error: "login_required", loginRequired: res.loginRequired };
  }
  return { ok: true, parsed: res.parsed, loginRequired: res.loginRequired };
}

/** Pull net worth, bank txns (~2 months), and credit report via Fi MCP. */
export async function fetchFiWealthSnapshot(userProfileId: string): Promise<FiMcpFetchResult> {
  if (!fiMcpEnabled()) {
    return { ok: false, error: "disabled", meta: { fi: "disabled" } };
  }

  if (!userProfileId?.trim()) {
    return { ok: false, error: "not_connected", meta: { fi: "not_connected" } };
  }

  const sessionId = await getOrCreateFiMcpSessionId(userProfileId);
  const authAt = await getFiMcpAuthenticatedAt(userProfileId);

  const netWorthRes = await fetchToolJson(sessionId, FI_MCP_TOOLS.netWorth);
  if (!netWorthRes.ok && netWorthRes.loginRequired) {
    return {
      ok: false,
      error: "login_required",
      loginUrl: netWorthRes.loginRequired.loginUrl,
      message: netWorthRes.loginRequired.message,
      meta: { fi: "login_required", fi_session: sessionId.slice(0, 20) },
    };
  }
  if (!netWorthRes.ok) {
    return {
      ok: false,
      error: netWorthRes.error,
      meta: { fi: "error", fi_error: netWorthRes.error },
    };
  }

  await markFiMcpAuthenticated(userProfileId);

  const snapshot: FiWealthSnapshot = {
    netWorth: parseNetWorth(netWorthRes.parsed),
  };

  const bankRes = await fetchToolJson(sessionId, FI_MCP_TOOLS.bankTransactions);
  if (bankRes.ok) {
    snapshot.bankTransactions = parseBankTransactions(bankRes.parsed);
  }

  const creditRes = await fetchToolJson(sessionId, FI_MCP_TOOLS.creditReport);
  if (creditRes.ok) {
    const credit = parseCreditReport(creditRes.parsed);
    snapshot.creditScore = credit.creditScore;
    snapshot.creditAccounts = credit.creditAccounts;
  }

  return {
    ok: true,
    snapshot,
    meta: {
      fi: "loaded",
      fi_auth_fresh: isFiMcpAuthFresh(authAt),
      fi_bank_txn_rows: snapshot.bankTransactions?.length ?? 0,
      fi_credit_accounts: snapshot.creditAccounts?.length ?? 0,
    },
  };
}

/** Begin Fi MCP connect — returns login URL when Fi requires browser auth. */
export async function beginFiMcpConnect(userProfileId: string): Promise<
  | { ok: true; alreadyConnected: true; snapshot: FiWealthSnapshot }
  | { ok: true; alreadyConnected: false; loginUrl: string; instructions: string }
  | { ok: false; error: string }
> {
  const res = await fetchFiWealthSnapshot(userProfileId);
  if (res.ok) {
    return { ok: true, alreadyConnected: true, snapshot: res.snapshot };
  }
  if (!res.ok && res.error === "login_required" && "loginUrl" in res) {
    return {
      ok: true,
      alreadyConnected: false,
      loginUrl: res.loginUrl,
      instructions:
        "1) Install Fi Money and link accounts in Net Worth.\n" +
        "2) Open the login URL below in your browser.\n" +
        "3) Enter your Fi phone number and passcode from Fi app: Net Worth → Talk to AI → Get Passcode.\n" +
        "4) Reply here: fi connected",
    };
  }
  return { ok: false, error: res.error };
}
