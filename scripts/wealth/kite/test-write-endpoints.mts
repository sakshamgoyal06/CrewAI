/**
 * Probe Kite write endpoints (Coin MF + equity) against a connected user token.
 *
 * Safe by default — uses invalid symbols/ids so nothing should execute.
 * Coin MF order placement is documented as unsupported (bank payment required).
 *
 * Usage:
 *   # From .env: KITE_API_KEY, KITE_API_SECRET, KITE_ACCESS_TOKEN
 *   npx tsx scripts/wealth/kite/test-write-endpoints.mts
 *
 *   # Or load token from Supabase for a Telegram user:
 *   TELEGRAM_USER_ID=7174221900 npx tsx scripts/wealth/kite/test-write-endpoints.mts
 *
 * Optional flags (still non-destructive unless noted):
 *   --isin INF000000000   MF probe ISIN (default: invalid)
 *   --equity-symbol FAKE  Equity probe symbol (default: MAGNUSFAKE)
 */
import "dotenv/config";

import {
  cancelKiteEquityOrder,
  cancelKiteMfOrder,
  cancelKiteMfSip,
  fetchKiteMfOrders,
  fetchKiteUserProfile,
  placeKiteEquityOrder,
  placeKiteMfOrder,
  placeKiteMfSip,
} from "../../../src/pillars/wealth/zerodha/kiteClient.js";

type ProbeResult = {
  name: string;
  endpoint: string;
  ok: boolean;
  status?: number;
  summary: string;
  raw?: string;
};

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) {
    return undefined;
  }
  return process.argv[idx + 1]?.trim() || undefined;
}

function summarizeError(error: string, status?: number): string {
  const trimmed = error.slice(0, 300);
  if (status != null) {
    return `HTTP ${status}: ${trimmed}`;
  }
  return trimmed;
}

async function resolveCreds(): Promise<
  | { ok: true; creds: { apiKey: string; accessToken: string }; source: string }
  | { ok: false; error: string }
> {
  const telegramUserId = process.env.TELEGRAM_USER_ID?.trim();
  if (telegramUserId) {
    const { supabase } = await import("../../../src/tools/clients.js");
    const { kiteCredentialsForUser } = await import(
      "../../../src/pillars/wealth/zerodha/kiteEnv.js"
    );
    const { data: profile, error } = await supabase
      .from("user_profile")
      .select("id, display_name, telegram_chat_id")
      .eq("telegram_chat_id", telegramUserId)
      .maybeSingle();

    if (error || !profile) {
      return {
        ok: false,
        error: `No user_profile for TELEGRAM_USER_ID=${telegramUserId}: ${error?.message ?? "missing row"}`,
      };
    }

    const creds = await kiteCredentialsForUser(profile.id);
    if (!creds.apiKey || !creds.accessToken) {
      return {
        ok: false,
        error: `User ${profile.display_name ?? profile.id} has no kite token. Say "connect Zerodha" in Telegram first.`,
      };
    }
    return {
      ok: true,
      creds: { apiKey: creds.apiKey, accessToken: creds.accessToken },
      source: `supabase:user_profile:${profile.id}`,
    };
  }

  const accessToken =
    process.env.KITE_ACCESS_TOKEN?.trim() || process.env.MAGNUS_KITE_ACCESS_TOKEN?.trim();
  const apiKey =
    process.env.KITE_API_KEY?.trim() ||
    process.env.MAGNUS_KITE_API_KEY?.trim();
  if (!apiKey || !accessToken) {
    return {
      ok: false,
      error:
        "Set KITE_API_KEY + KITE_ACCESS_TOKEN in .env, or TELEGRAM_USER_ID to load token from Supabase.",
    };
  }
  return {
    ok: true,
    creds: { apiKey, accessToken },
    source: "env:KITE_ACCESS_TOKEN",
  };
}

const credsResult = await resolveCreds();
if (!credsResult.ok) {
  console.error(credsResult.error);
  process.exit(1);
}

const { creds, source } = credsResult;
const mfIsin = argValue("--isin") ?? "INF000000000";
const equitySymbol = argValue("--equity-symbol") ?? "MAGNUSFAKE";

const results: ProbeResult[] = [];

const profileRes = await fetchKiteUserProfile(creds);
results.push({
  name: "read_profile",
  endpoint: "GET /user/profile",
  ok: profileRes.ok,
  summary: profileRes.ok
    ? `Connected as ${profileRes.profile.user_id} (${profileRes.profile.user_name})`
    : summarizeError(profileRes.error),
});

const mfOrdersRes = await fetchKiteMfOrders(creds);
results.push({
  name: "read_mf_orders",
  endpoint: "GET /mf/orders",
  ok: mfOrdersRes.ok,
  summary: mfOrdersRes.ok
    ? `${mfOrdersRes.orders.length} MF orders in last 7 days`
    : summarizeError(mfOrdersRes.error),
});

const mfBuyRes = await placeKiteMfOrder(creds, {
  tradingsymbol: mfIsin,
  transactionType: "BUY",
  amount: 100,
  tag: "magnus",
});
results.push({
  name: "coin_mf_place_order",
  endpoint: "POST /mf/orders",
  ok: mfBuyRes.ok,
  status: mfBuyRes.ok ? undefined : mfBuyRes.status,
  summary: mfBuyRes.ok
    ? `Unexpected success — order_id=${mfBuyRes.order.order_id}`
    : summarizeError(mfBuyRes.error, mfBuyRes.status),
  raw: mfBuyRes.ok ? undefined : mfBuyRes.error,
});

const mfCancelRes = await cancelKiteMfOrder(creds, "00000000-0000-0000-0000-000000000000");
results.push({
  name: "coin_mf_cancel_order",
  endpoint: "DELETE /mf/orders/:id",
  ok: mfCancelRes.ok,
  status: mfCancelRes.ok ? undefined : mfCancelRes.status,
  summary: mfCancelRes.ok
    ? `Unexpected success — cancelled ${mfCancelRes.orderId}`
    : summarizeError(mfCancelRes.error, mfCancelRes.status),
  raw: mfCancelRes.ok ? undefined : mfCancelRes.error,
});

const mfSipRes = await placeKiteMfSip(creds, {
  tradingsymbol: mfIsin,
  amount: 500,
  frequency: "monthly",
  instalments: 1,
  instalmentDay: 5,
  tag: "magnus",
});
results.push({
  name: "coin_mf_place_sip",
  endpoint: "POST /mf/sips",
  ok: mfSipRes.ok,
  status: mfSipRes.ok ? undefined : mfSipRes.status,
  summary: mfSipRes.ok
    ? `Unexpected success — sip_id=${mfSipRes.sip.sip_id}`
    : summarizeError(mfSipRes.error, mfSipRes.status),
  raw: mfSipRes.ok ? undefined : mfSipRes.error,
});

const mfSipCancelRes = await cancelKiteMfSip(creds, "000000000000000");
results.push({
  name: "coin_mf_cancel_sip",
  endpoint: "DELETE /mf/sips/:id",
  ok: mfSipCancelRes.ok,
  status: mfSipCancelRes.ok ? undefined : mfSipCancelRes.status,
  summary: mfSipCancelRes.ok
    ? `Unexpected success — cancelled ${mfSipCancelRes.sipId}`
    : summarizeError(mfSipCancelRes.error, mfSipCancelRes.status),
  raw: mfSipCancelRes.ok ? undefined : mfSipCancelRes.error,
});

const equityPlaceRes = await placeKiteEquityOrder(creds, {
  tradingsymbol: equitySymbol,
  exchange: "NSE",
  transactionType: "BUY",
  orderType: "LIMIT",
  quantity: 1,
  product: "CNC",
  price: 1,
  tag: "magnus",
});
results.push({
  name: "kite_equity_place_order",
  endpoint: "POST /orders/regular",
  ok: equityPlaceRes.ok,
  status: equityPlaceRes.ok ? undefined : equityPlaceRes.status,
  summary: equityPlaceRes.ok
    ? `Order accepted — order_id=${equityPlaceRes.order.order_id} (cancel manually if live)`
    : summarizeError(equityPlaceRes.error, equityPlaceRes.status),
  raw: equityPlaceRes.ok ? undefined : equityPlaceRes.error,
});

if (equityPlaceRes.ok) {
  const equityCancelRes = await cancelKiteEquityOrder(creds, {
    orderId: equityPlaceRes.order.order_id,
  });
  results.push({
    name: "kite_equity_cancel_order",
    endpoint: "DELETE /orders/regular/:id",
    ok: equityCancelRes.ok,
    status: equityCancelRes.ok ? undefined : equityCancelRes.status,
    summary: equityCancelRes.ok
      ? `Cancelled probe order ${equityCancelRes.orderId}`
      : summarizeError(equityCancelRes.error, equityCancelRes.status),
    raw: equityCancelRes.ok ? undefined : equityCancelRes.error,
  });
} else {
  const equityCancelRes = await cancelKiteEquityOrder(creds, {
    orderId: "000000000000000",
  });
  results.push({
    name: "kite_equity_cancel_order",
    endpoint: "DELETE /orders/regular/:id",
    ok: equityCancelRes.ok,
    status: equityCancelRes.ok ? undefined : equityCancelRes.status,
    summary: equityCancelRes.ok
      ? `Unexpected success — cancelled ${equityCancelRes.orderId}`
      : summarizeError(equityCancelRes.error, equityCancelRes.status),
    raw: equityCancelRes.ok ? undefined : equityCancelRes.error,
  });
}

console.log(
  JSON.stringify(
    {
      credsSource: source,
      note:
        "Coin (MF) write endpoints are documented as unsupported for order placement (bank payment). " +
        "Failures here are expected. Equity write probes use invalid/far-limit symbols by default.",
      probes: results,
    },
    null,
    2,
  ),
);

const readFailed = !profileRes.ok;
if (readFailed) {
  process.exit(1);
}
