import { kiteApiBaseUrl, kiteFetchTimeoutMs } from "./kiteEnv.js";
import type {
  KiteEnvelope,
  KiteEquityOrderPlaceResult,
  KiteHolding,
  KiteMargins,
  KiteMfHolding,
  KiteMfOrder,
  KiteMfOrderPlaceResult,
  KiteMfSip,
  KiteMfSipPlaceResult,
  KitePortfolioSnapshot,
  KiteSessionData,
  KiteUserProfile,
} from "./types.js";

type KiteCreds = { apiKey: string; accessToken: string };
type KiteHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

function kiteAuthHeaders(creds: KiteCreds, method: KiteHttpMethod): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Kite-Version": "3",
    Authorization: `token ${creds.apiKey}:${creds.accessToken}`,
  };
  if (method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  return headers;
}

async function kiteRequest<T>(
  path: string,
  creds: { apiKey: string; accessToken: string },
  options: {
    method?: KiteHttpMethod;
    body?: URLSearchParams;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const base = kiteApiBaseUrl().replace(/\/$/, "");
  const url = `${base}${path}`;
  const timeoutMs = options.timeoutMs ?? kiteFetchTimeoutMs();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const method = options.method ?? "GET";

  try {
    const res = await fetchFn(url, {
      method,
      signal: ac.signal,
      headers: kiteAuthHeaders(creds, method),
      ...(options.body ? { body: options.body.toString() } : {}),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: text.slice(0, 500) || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    try {
      const parsed = JSON.parse(text) as KiteEnvelope<T> | T;
      if (parsed && typeof parsed === "object" && "data" in parsed) {
        return { ok: true, data: (parsed as KiteEnvelope<T>).data };
      }
      return { ok: true, data: parsed as T };
    } catch {
      return { ok: false, error: "Invalid JSON from Kite API", status: res.status };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

export async function exchangeKiteRequestToken(input: {
  apiKey: string;
  apiSecret: string;
  requestToken: string;
  fetchImpl?: typeof fetch;
}): Promise<
  { ok: true; session: KiteSessionData } | { ok: false; error: string; status?: number }
> {
  const { createHash } = await import("node:crypto");
  const checksum = createHash("sha256")
    .update(`${input.apiKey}${input.requestToken}${input.apiSecret}`)
    .digest("hex");

  const body = new URLSearchParams({
    api_key: input.apiKey,
    request_token: input.requestToken,
    checksum,
  });

  const base = kiteApiBaseUrl().replace(/\/$/, "");
  const timeoutMs = kiteFetchTimeoutMs();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const fetchFn = input.fetchImpl ?? globalThis.fetch;

  try {
    const res = await fetchFn(`${base}/session/token`, {
      method: "POST",
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "X-Kite-Version": "3",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: text.slice(0, 500) || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    const parsed = JSON.parse(text) as KiteEnvelope<KiteSessionData & { user_id?: string }>;
    const session = parsed.data;
    if (!session?.access_token?.trim()) {
      return { ok: false, error: "Kite did not return an access_token", status: res.status };
    }
    return {
      ok: true,
      session: {
        access_token: session.access_token.trim(),
        user_id: session.user_id,
        user_name: session.user_name,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchKiteUserProfile(
  creds: KiteCreds & { apiKey: string; accessToken: string },
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; profile: KiteUserProfile } | { ok: false; error: string }> {
  const res = await kiteRequest<KiteUserProfile>("/user/profile", creds, options);
  if (!res.ok) {
    return res;
  }
  return { ok: true, profile: res.data };
}

export async function fetchKiteHoldings(
  creds: KiteCreds & { apiKey: string; accessToken: string },
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; holdings: KiteHolding[] } | { ok: false; error: string }> {
  const res = await kiteRequest<KiteHolding[]>("/portfolio/holdings", creds, options);
  if (!res.ok) {
    return res;
  }
  return { ok: true, holdings: res.data ?? [] };
}

export async function fetchKiteMfHoldings(
  creds: KiteCreds & { apiKey: string; accessToken: string },
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; holdings: KiteMfHolding[] } | { ok: false; error: string }> {
  const res = await kiteRequest<KiteMfHolding[]>("/mf/holdings", creds, options);
  if (!res.ok) {
    return res;
  }
  return { ok: true, holdings: res.data ?? [] };
}

export async function fetchKiteMfSips(
  creds: KiteCreds & { apiKey: string; accessToken: string },
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; sips: KiteMfSip[] } | { ok: false; error: string }> {
  const res = await kiteRequest<KiteMfSip[]>("/mf/sips", creds, options);
  if (!res.ok) {
    return res;
  }
  return { ok: true, sips: res.data ?? [] };
}

export async function fetchKiteMargins(
  creds: KiteCreds & { apiKey: string; accessToken: string },
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; margins: KiteMargins } | { ok: false; error: string }> {
  const res = await kiteRequest<KiteMargins>("/user/margins", creds, options);
  if (!res.ok) {
    return res;
  }
  return { ok: true, margins: res.data ?? {} };
}

/** Probe / write: place Coin MF order (may be disabled by Zerodha — see docs). */
export async function placeKiteMfOrder(
  creds: KiteCreds,
  input: {
    tradingsymbol: string;
    transactionType: "BUY" | "SELL";
    amount?: number;
    quantity?: number;
    tag?: string;
  },
  options?: { fetchImpl?: typeof fetch },
): Promise<
  { ok: true; order: KiteMfOrderPlaceResult } | { ok: false; error: string; status?: number }
> {
  const body = new URLSearchParams({
    tradingsymbol: input.tradingsymbol,
    transaction_type: input.transactionType,
  });
  if (input.amount != null) {
    body.set("amount", String(input.amount));
  }
  if (input.quantity != null) {
    body.set("quantity", String(input.quantity));
  }
  if (input.tag?.trim()) {
    body.set("tag", input.tag.trim());
  }

  const res = await kiteRequest<KiteMfOrderPlaceResult>("/mf/orders", creds, {
    ...options,
    method: "POST",
    body,
  });
  if (!res.ok) {
    return res;
  }
  return { ok: true, order: res.data };
}

/** Probe / write: cancel Coin MF order. */
export async function cancelKiteMfOrder(
  creds: KiteCreds,
  orderId: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; orderId: string } | { ok: false; error: string; status?: number }> {
  const res = await kiteRequest<{ order_id?: string }>(
    `/mf/orders/${encodeURIComponent(orderId)}`,
    creds,
    { ...options, method: "DELETE" },
  );
  if (!res.ok) {
    return res;
  }
  return { ok: true, orderId: res.data?.order_id ?? orderId };
}

/** Probe / write: create Coin MF SIP (may be disabled by Zerodha — see docs). */
export async function placeKiteMfSip(
  creds: KiteCreds,
  input: {
    tradingsymbol: string;
    amount: number;
    frequency: "weekly" | "monthly" | "quarterly";
    instalments?: number;
    instalmentDay?: number;
    initialAmount?: number;
    tag?: string;
  },
  options?: { fetchImpl?: typeof fetch },
): Promise<
  { ok: true; sip: KiteMfSipPlaceResult } | { ok: false; error: string; status?: number }
> {
  const body = new URLSearchParams({
    tradingsymbol: input.tradingsymbol,
    amount: String(input.amount),
    frequency: input.frequency,
  });
  if (input.instalments != null) {
    body.set("instalments", String(input.instalments));
  }
  if (input.instalmentDay != null) {
    body.set("instalment_day", String(input.instalmentDay));
  }
  if (input.initialAmount != null) {
    body.set("initial_amount", String(input.initialAmount));
  }
  if (input.tag?.trim()) {
    body.set("tag", input.tag.trim());
  }

  const res = await kiteRequest<KiteMfSipPlaceResult>("/mf/sips", creds, {
    ...options,
    method: "POST",
    body,
  });
  if (!res.ok) {
    return res;
  }
  return { ok: true, sip: res.data };
}

/** Probe / write: cancel Coin MF SIP. */
export async function cancelKiteMfSip(
  creds: KiteCreds,
  sipId: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; sipId: string } | { ok: false; error: string; status?: number }> {
  const res = await kiteRequest<{ sip_id?: string }>(
    `/mf/sips/${encodeURIComponent(sipId)}`,
    creds,
    { ...options, method: "DELETE" },
  );
  if (!res.ok) {
    return res;
  }
  return { ok: true, sipId: res.data?.sip_id ?? sipId };
}

/** Probe / write: place Kite equity/F&O order. Use with extreme care. */
export async function placeKiteEquityOrder(
  creds: KiteCreds,
  input: {
    variety?: string;
    tradingsymbol: string;
    exchange: string;
    transactionType: "BUY" | "SELL";
    orderType: string;
    quantity: number;
    product: string;
    validity?: string;
    price?: number;
    triggerPrice?: number;
    tag?: string;
    marketProtection?: number;
  },
  options?: { fetchImpl?: typeof fetch },
): Promise<
  { ok: true; order: KiteEquityOrderPlaceResult } | { ok: false; error: string; status?: number }
> {
  const variety = input.variety ?? "regular";
  const body = new URLSearchParams({
    tradingsymbol: input.tradingsymbol,
    exchange: input.exchange,
    transaction_type: input.transactionType,
    order_type: input.orderType,
    quantity: String(input.quantity),
    product: input.product,
    validity: input.validity ?? "DAY",
  });
  if (input.price != null) {
    body.set("price", String(input.price));
  }
  if (input.triggerPrice != null) {
    body.set("trigger_price", String(input.triggerPrice));
  }
  if (input.tag?.trim()) {
    body.set("tag", input.tag.trim());
  }
  if (input.marketProtection != null) {
    body.set("market_protection", String(input.marketProtection));
  }

  const res = await kiteRequest<KiteEquityOrderPlaceResult>(`/orders/${variety}`, creds, {
    ...options,
    method: "POST",
    body,
  });
  if (!res.ok) {
    return res;
  }
  return { ok: true, order: res.data };
}

/** Probe / write: cancel Kite equity/F&O order. */
export async function cancelKiteEquityOrder(
  creds: KiteCreds,
  input: { variety?: string; orderId: string },
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; orderId: string } | { ok: false; error: string; status?: number }> {
  const variety = input.variety ?? "regular";
  const res = await kiteRequest<{ order_id?: string }>(
    `/orders/${variety}/${encodeURIComponent(input.orderId)}`,
    creds,
    { ...options, method: "DELETE" },
  );
  if (!res.ok) {
    return res;
  }
  return { ok: true, orderId: res.data?.order_id ?? input.orderId };
}

/** Read MF orders from the last 7 days. */
export async function fetchKiteMfOrders(
  creds: KiteCreds,
  options?: { fetchImpl?: typeof fetch },
): Promise<{ ok: true; orders: KiteMfOrder[] } | { ok: false; error: string }> {
  const res = await kiteRequest<KiteMfOrder[]>("/mf/orders", creds, options);
  if (!res.ok) {
    return res;
  }
  return { ok: true, orders: res.data ?? [] };
}

/** Read-only portfolio snapshot for wealth agent context. */
export async function fetchKitePortfolioSnapshot(
  userProfileId: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<
  | { ok: true; snapshot: KitePortfolioSnapshot; meta: Record<string, unknown> }
  | { ok: false; error: string; meta: Record<string, unknown> }
> {
  const { kiteCredentialsForUser: loadCreds } = await import("./kiteEnv.js");
  const creds = await loadCreds(userProfileId);
  if (!creds.apiKey || !creds.accessToken) {
    return {
      ok: false,
      error: "not_connected",
      meta: { kite: "not_connected" },
    };
  }

  const [profileRes, holdingsRes, mfRes, sipsRes, marginsRes] = await Promise.all([
    fetchKiteUserProfile(creds, options),
    fetchKiteHoldings(creds, options),
    fetchKiteMfHoldings(creds, options),
    fetchKiteMfSips(creds, options),
    fetchKiteMargins(creds, options),
  ]);

  const tokenExpired = [holdingsRes, mfRes, marginsRes].some(
    (r) => !r.ok && /token|session|expired|invalid.*api_key|403/i.test(r.error),
  );

  if (tokenExpired) {
    return {
      ok: false,
      error: "token_expired",
      meta: { kite: "token_expired" },
    };
  }

  const snapshot: KitePortfolioSnapshot = {
    profile: profileRes.ok ? profileRes.profile : undefined,
    holdings: holdingsRes.ok ? holdingsRes.holdings : [],
    mfHoldings: mfRes.ok ? mfRes.holdings : [],
    mfSips: sipsRes.ok ? sipsRes.sips : [],
    margins: marginsRes.ok ? marginsRes.margins : undefined,
  };

  const errors: string[] = [];
  if (!holdingsRes.ok) {
    errors.push(`holdings: ${holdingsRes.error}`);
  }
  if (!mfRes.ok) {
    errors.push(`mf: ${mfRes.error}`);
  }
  if (!sipsRes.ok) {
    errors.push(`sips: ${sipsRes.error}`);
  }

  return {
    ok: true,
    snapshot,
    meta: {
      kite: "loaded",
      kite_equity_rows: snapshot.holdings.length,
      kite_mf_rows: snapshot.mfHoldings.length,
      kite_sip_rows: snapshot.mfSips.length,
      ...(errors.length ? { kite_partial_errors: errors } : {}),
    },
  };
}
