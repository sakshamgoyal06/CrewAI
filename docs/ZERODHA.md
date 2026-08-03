# Zerodha (Kite Connect)

Magnus reads your Zerodha portfolio **read-only** for wealth coaching: equity holdings, Coin mutual funds, SIPs, and available cash. Magnus **never places trades**.

## Credential model (per user, like Hevy)

| Credential | Where it lives | Notes |
|------------|----------------|-------|
| **API key + secret** | `user_integrations` | Your personal Kite Connect app from developers.kite.trade |
| **Access token** | `user_integrations` | From OAuth login; expires daily ~6 AM IST |
| **Public callback URL** | Host env (`MAGNUS_PUBLIC_BASE_URL`) | Shared infrastructure only — not a Zerodha secret |

**Do not put `KITE_API_KEY` / `KITE_API_SECRET` on Railway.** Use local `.env` + upsert script (same pattern as Hevy).

### Why per user?

Kite Connect has two layers:

1. **App credentials** (api key + secret) — identify *your* Kite Connect app registration
2. **Access token** — authorizes read access to *your* Zerodha account after login

For a personal Magnus bot, both belong with your profile — not on the shared host. Google OAuth is different: one Magnus OAuth *client* serves all users; Kite apps are typically one per person.

## Prerequisites

1. **Kite Connect app** at [developers.kite.trade](https://developers.kite.trade)
   - Plan: **Personal (free)** — portfolio, orders, margins (no live/historical market data)
   - Register redirect URI: `{MAGNUS_PUBLIC_BASE_URL}/oauth/kite/callback`
2. **Public HTTPS callback** on the host: `MAGNUS_PUBLIC_BASE_URL`
3. **Migrations**:
   - `20260803120000_user_integrations_kite.sql`
   - `20260803130000_user_integrations_kite_app_creds.sql`

## Provision your credentials

```bash
# Local .env only — never Railway
KITE_API_KEY=your_api_key
KITE_API_SECRET=your_api_secret

TELEGRAM_USER_ID=<your_id> npx tsx scripts/upsert-user-integrations.mts
```

Verify: `GET https://your-host/oauth/kite` returns the expected `redirect_uri`.

## Connect in Telegram

Say **`connect Zerodha`** — Magnus sends a login link. After Zerodha login, portfolio access is stored and confirmed in Telegram.

## Token expiry

Kite access tokens **expire daily (~6 AM IST)**. Say `connect Zerodha` again to refresh (app key/secret stay in DB).

## What wealth sees

| Data | Kite endpoint |
|------|---------------|
| Equity holdings | `/portfolio/holdings` |
| Coin MF holdings | `/mf/holdings` |
| Active SIPs | `/mf/sips` |
| Available cash | `/user/margins` |

## Code layout

| Path | Role |
|------|------|
| `src/pillars/wealth/zerodha/kiteEnv.ts` | Per-user cred resolution (DB → env fallback) |
| `src/integrations/zerodha/oauthFlow.ts` | OAuth begin/complete |
| `src/agents/wealth/wealthAgent.ts` | Injects portfolio context |

## Safety

- Read-only — no order APIs wired
- API secret never on the host in production
- No buy/sell advice from the wealth specialist
