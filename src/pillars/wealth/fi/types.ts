/** Fi MCP (Fi Money Net Worth) — wealth context types. */

export type FiMoneyValue = {
  currencyCode?: string;
  units?: string;
  nanos?: number;
};

export type FiNetWorthSnapshot = {
  totalNetWorth?: FiMoneyValue;
  assets?: Array<{ label: string; valueInr: number }>;
  liabilities?: Array<{ label: string; valueInr: number }>;
};

export type FiBankTransaction = {
  bank: string;
  amount: number;
  narration: string;
  date: string;
  type: string;
  balanceAfter?: number;
};

export type FiCreditAccount = {
  subscriber?: string;
  accountType?: string;
  currentBalance?: number;
  creditLimit?: number;
  status?: string;
};

export type FiWealthSnapshot = {
  netWorth?: FiNetWorthSnapshot;
  bankTransactions?: FiBankTransaction[];
  creditAccounts?: FiCreditAccount[];
  creditScore?: string;
};

export type FiMcpLoginRequired = {
  ok: false;
  error: "login_required";
  loginUrl: string;
  message?: string;
  meta: Record<string, unknown>;
};

export type FiMcpSessionExpired = {
  ok: false;
  error: "session_expired";
  meta: Record<string, unknown>;
};

export type FiMcpNotConnected = {
  ok: false;
  error: "not_connected";
  meta: Record<string, unknown>;
};

export type FiMcpFetchOk = {
  ok: true;
  snapshot: FiWealthSnapshot;
  meta: Record<string, unknown>;
};

export type FiMcpFetchResult =
  | FiMcpFetchOk
  | FiMcpLoginRequired
  | FiMcpSessionExpired
  | FiMcpNotConnected
  | { ok: false; error: string; meta: Record<string, unknown> };
