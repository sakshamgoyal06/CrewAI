# Zerodha (Kite Connect)

Magnus connects to Zerodha for **wealth coaching**. Today: **read-only** (holdings, Coin MF, SIPs, cash). Later: equity + MF orders for users who opt in (gated in code).

## Multi-user architecture (like Google OAuth)

```
┌─────────────────────────────────────────────────────────────┐
│  Railway / host (once)                                       │
│  KITE_API_KEY + KITE_API_SECRET  ← Magnus's ONE Kite app    │
│  MAGNUS_PUBLIC_BASE_URL          ← OAuth callback base       │
└─────────────────────────────────────────────────────────────┘
                              │
          Each Telegram user  │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase user_integrations (per user)                       │
│  kite_access_token   ← from "connect Zerodha" OAuth login   │
│  kite_user_id        ← Zerodha client id                     │
│  kite_token_obtained_at                                      │
└─────────────────────────────────────────────────────────────┘
```

| Credential | Where | Who sets it up |
|------------|-------|----------------|
| **API key + secret** | **Host env** (Railway) | You (once) at developers.kite.trade |
| **Access token** | `user_integrations` | Each user via in-chat OAuth |
| **Callback URL** | Host env | `MAGNUS_PUBLIC_BASE_URL` |

**New users do not join developers.kite.trade.** They only log in with their Zerodha account when Magnus sends a connect link.

Optional: `user_integrations.kite_api_key/secret` columns exist for local dev when host env is unset — not used in production multi-user.

## Host setup (you, once)

1. [developers.kite.trade](https://developers.kite.trade) → create app
   - **Personal (free)** works for portfolio read today
   - For live market data later: paid plan (₹500/mo)
   - Redirect URI: `{MAGNUS_PUBLIC_BASE_URL}/oauth/kite/callback`
2. Railway env:
   ```bash
   KITE_API_KEY=...
   KITE_API_SECRET=...
   MAGNUS_PUBLIC_BASE_URL=https://your-app.up.railway.app
   ```
3. Migrations on Supabase:
   - `20260803120000_user_integrations_kite.sql`
   - `20260803130000_user_integrations_kite_app_creds.sql` (optional override columns)

Verify: `GET https://your-host/oauth/kite`

## Per-user connect

Any allowlisted user says **`connect Zerodha`** in Telegram → login → token stored on **their** `user_integrations` row.

Tokens expire **daily (~6 AM IST)**. Say `connect Zerodha` again to refresh.

## Read-only today

Wealth agent fetches:

| Data | Endpoint |
|------|----------|
| Equity holdings | `/portfolio/holdings` |
| Coin MF holdings | `/mf/holdings` |
| SIPs | `/mf/sips` |
| Cash | `/user/margins` |

No order APIs are called. `kiteOrdersEnabled()` returns false unless `MAGNUS_KITE_ORDERS_ENABLED=true`.

## Future: trading + MF orders

Planned behind explicit flags and user consent (not wired yet):

| Capability | Kite API | Extra requirements |
|------------|----------|-------------------|
| Equity orders | `place_order`, GTT | Static IP on developer console (SEBI, from Apr 2026); `MAGNUS_KITE_ORDERS_ENABLED=true` |
| MF buy/sell | `/mf/orders` | Bank payment authorization per order; same order gate |
| MF SIP create/modify | `/mf/sips` | User confirmation flow in Telegram |

Code hook: `kiteOrdersEnabled()` in `src/pillars/wealth/zerodha/kiteEnv.ts` — order client methods will no-op until this is true.

**Safety defaults (keep when orders ship):**
- No orders from wealth coaching prompts alone — dedicated confirm step
- Per-user token only accesses that user's account
- Wealth specialist still avoids buy/sell *advice*; execution is a separate tool path

## Code layout

| Path | Role |
|------|------|
| `src/pillars/wealth/zerodha/kiteEnv.ts` | Platform creds + `kiteOrdersEnabled()` |
| `src/integrations/zerodha/oauthFlow.ts` | OAuth |
| `src/agents/wealth/wealthAgent.ts` | Read-only context injection |

## Local dev

Use host env in `.env` for `KITE_API_KEY/SECRET`. Per-user tokens still come from OAuth in chat (or manual upsert of `KITE_ACCESS_TOKEN` for testing).
