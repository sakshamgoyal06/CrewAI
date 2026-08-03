# Zerodha (Kite Connect)

Magnus reads your Zerodha portfolio **read-only** for wealth coaching: equity holdings, Coin mutual funds, SIPs, and available cash. Magnus **never places trades**.

## Prerequisites

1. **Kite Connect app** at [developers.kite.trade](https://developers.kite.trade)
   - Plan: **Personal (free)** — portfolio, orders, margins (no live/historical market data)
   - Note your **API key** and **API secret**
2. **Public HTTPS callback** — same as Google OAuth:
   - Set `MAGNUS_PUBLIC_BASE_URL` on the host (or use Railway/Render auto-detection)
   - Register redirect URI: `{MAGNUS_PUBLIC_BASE_URL}/oauth/kite/callback`
3. **Apply migration** — `supabase/migrations/20260803120000_user_integrations_kite.sql`

## Host env (Railway / `.env`)

```bash
KITE_API_KEY=your_api_key
KITE_API_SECRET=your_api_secret
MAGNUS_PUBLIC_BASE_URL=https://your-app.up.railway.app
```

Verify: `GET https://your-host/oauth/kite` returns the expected `redirect_uri`.

## Connect in Telegram

Say:

- `connect Zerodha`
- `link Kite`

Magnus sends a one-time login link (15 min). After Zerodha login, the browser shows success and Magnus confirms in Telegram.

## Token expiry

Kite access tokens **expire daily (~6 AM IST)**. Say `connect Zerodha` again to refresh.

## What wealth sees

On each wealth turn (when connected), Magnus fetches:

| Data | Kite endpoint |
|------|---------------|
| Equity holdings | `/portfolio/holdings` |
| Coin MF holdings | `/mf/holdings` |
| Active SIPs | `/mf/sips` |
| Available cash | `/user/margins` |

## Manual token seed (optional)

For local dev without OAuth:

```bash
# .env — then upsert
KITE_ACCESS_TOKEN=...
KITE_USER_ID=AB1234
TELEGRAM_USER_ID=... npx tsx scripts/upsert-user-integrations.mts
```

Prefer the in-chat connect flow in production.

## Code layout

| Path | Role |
|------|------|
| `src/pillars/wealth/zerodha/` | Kite API client, formatters |
| `src/integrations/zerodha/oauthFlow.ts` | OAuth begin/complete |
| `src/agents/tools/kiteConnectTool.ts` | Magnus + wealth connect |
| `src/agents/wealth/wealthAgent.ts` | Injects portfolio context |

## Safety

- Read-only in Magnus — no order APIs wired
- No buy/sell advice from the wealth specialist
- API secret stays on the host; access token per user in `user_integrations`
