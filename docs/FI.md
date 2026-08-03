# Fi Money

Magnus connects to **Fi Money** for **wealth coaching** beyond Zerodha: net worth, bank transactions, credit report, and linked investments across banks and cards.

**You do not run an MCP server.** Magnus calls Fi Money’s cloud API from the bot. In Telegram you only say `connect Fi`.

Read-only — Magnus never moves money.

## What you need (your end)

### 1. Fi Money app (one-time)

1. Install **Fi Money** on your phone.
2. Open **Net Worth** and link the accounts you care about (banks, credit cards, investments Fi supports).
3. Confirm net worth looks right inside Fi before connecting Magnus.

### 2. Magnus host (already set up if the bot runs)

| Requirement | Why |
|-------------|-----|
| **Redis** (`UPSTASH_REDIS_*`) | Stores your Fi login session (~30 min) — same Redis as Kite OAuth |
| **Deploy latest `main`** | Fi integration ships in the wealth agent + `connect_fi` tool |
| **No Fi API keys** | Auth is browser login + passcode from the Fi app |

Optional env (defaults are fine):

```bash
MAGNUS_FI_MCP_ENABLED=true
MAGNUS_FI_MCP_URL=https://mcp.fi.money:8080/mcp/stream
MAGNUS_FI_MCP_SESSION_TTL_SEC=1800
```

> **Note:** Fi exposes their API over MCP protocol on their servers. Magnus uses that internally — you never configure or host MCP yourself.

### 3. Connect in Telegram (each session, ~30 min)

1. Say **`connect Fi`**
2. Open the login URL Magnus sends (phone browser is fine)
3. Enter your Fi phone number + **passcode** from: **Fi app → Net Worth → Talk to AI → Get Passcode**
4. Reply **`fi connected`**

Magnus then loads net worth, recent bank transactions, and your credit report into wealth coaching.

Sessions expire after **~30 minutes** (Fi passcode lifetime). Say `connect Fi` again to refresh.

Say **`disconnect Fi`** to clear the session on Magnus.

## Architecture (Magnus side)

```
Telegram user
    → connect Fi / wealth questions
    → Magnus wealth agent + Redis session
    → Fi Money cloud API (mcp.fi.money)
    → net worth, bank txns, credit report → coaching context
```

| Source | Best for |
|--------|----------|
| **Fi** | Banks, credit cards, loans, holistic net worth |
| **Zerodha (Kite)** | Equity holdings, Coin MF, SIPs, broker cash |

Both contexts are injected when connected.

## Data loaded

| Data | Use in coaching |
|------|-----------------|
| Net worth + asset/liability split | Overall picture, allocation |
| Bank transactions (~2 months) | Spending patterns, cash flow |
| Credit report | Score, card balances/limits |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| “Fi login not complete” | Finish browser login; get a fresh passcode from Fi app |
| “Could not reach Fi Money” | Retry; Fi may rate-limit or block some datacenter IPs |
| Data stale / missing | Session expired — `connect Fi` again |
| No accounts in Magnus | Link accounts in Fi app Net Worth first |

## Dev probe (optional)

```bash
npm run fi:probe
# With passcode: npm run fi:probe -- YOUR_PASSCODE
```

Fi may return 503 from some cloud IPs. The Telegram flow on Railway usually works if Redis is configured.

## Code

- `src/pillars/wealth/fi/` — Fi client, session, snapshot, prompt formatting
- `src/agents/tools/fiConnectTool.ts` — connect / ack / disconnect fast paths
- `src/agents/wealth/wealthAgent.ts` — injects Fi + Kite context

Fi docs: [fi.money/features/getting-started-with-fi-mcp](https://fi.money/features/getting-started-with-fi-mcp)
