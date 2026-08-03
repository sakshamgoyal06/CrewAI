import { kiteApiBaseUrl, kiteFetchTimeoutMs } from "./kiteEnv.js";
import type {
  KiteEnvelope,
  KiteHolding,
  KiteMargins,
  KiteMfHolding,
  KiteMfSip,
  KitePortfolioSnapshot,
  KiteSessionData,
  KiteUserProfile,
} from "./types.js";

type KiteCreds = { apiKey: string; accessToken: string };

async function kiteRequest<T>(
  path: string,
  creds: { apiKey: string; accessToken: string },
  options: {
    method?: "GET" | "POST";
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
      headers: {
        Accept: "application/json",
        "X-Kite-Version": "3",
        ...(method === "GET"
          ? { Authorization: `token ${creds.apiKey}:${creds.accessToken}` }
          : { "Content-Type": "application/x-www-form-urlencoded" }),
      },
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
