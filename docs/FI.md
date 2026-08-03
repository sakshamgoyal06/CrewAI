# Fi Money (MCP)

Magnus connects to **Fi Money** via their official MCP server for **wealth coaching** beyond Zerodha: net worth, bank transactions, credit report, and (via Fi) linked investments across banks and cards.

Read-only — Magnus never moves money.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Railway / host (once)                                       │
│  MAGNUS_FI_MCP_ENABLED=true (default)                        │
│  UPSTASH_REDIS_*              ← per-user MCP session ids     │
└─────────────────────────────────────────────────────────────┘
                              │
          Each Telegram user  │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Redis (per user, ~30 min TTL)                               │
│  magnus:fi_mcp:session:{userProfileId}                       │
│  magnus:fi_mcp:auth_at:{userProfileId}                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Fi MCP — https://mcp.fi.money:8080/mcp/stream               │
│  fetch_net_worth, fetch_bank_transactions, fetch_credit_report │
└─────────────────────────────────────────────────────────────┘
```

| Credential | Where | Who sets it up |
|------------|-------|----------------|
| **MCP URL** | Host env (optional) | Default: Fi production MCP |
| **Session id** | Redis | Magnus on first connect |
| **Passcode** | Fi app (user) | Net Worth → Talk to AI → Get Passcode |

No Fi API keys. Users authenticate in the browser with phone + passcode.

## Host setup

1. Ensure **Redis** is configured (`UPSTASH_REDIS_REST_URL` + token) — same as Kite OAuth state.
2. Optional env (defaults are fine):
   ```bash
   MAGNUS_FI_MCP_ENABLED=true
   MAGNUS_FI_MCP_URL=https://mcp.fi.money:8080/mcp/stream
   MAGNUS_FI_MCP_SESSION_TTL_SEC=1800
   MAGNUS_FI_MCP_FETCH_TIMEOUT_MS=20000
   ```

## Per-user connect (Telegram)

1. User says **`connect Fi`**
2. Magnus returns a browser login URL + instructions
3. User opens URL, enters Fi phone number + passcode from Fi app
4. User replies **`fi connected`**
5. Magnus loads net worth, bank transactions (~2 months), and credit report into wealth coaching context

Sessions expire after **~30 minutes** (Fi passcode lifetime). Say `connect Fi` again to refresh.

Say **`disconnect Fi`** to clear the Redis session.

## Data loaded for wealth agent

| Tool | Data |
|------|------|
| `fetch_net_worth` | Total net worth, asset/liability breakdown |
| `fetch_bank_transactions` | Recent bank txns across linked accounts |
| `fetch_credit_report` | Bureau score, credit card/loan accounts |

Optional tools (not wired into default snapshot yet): `fetch_mf_transactions`, `fetch_epf_details`, `fetch_stock_transactions`.

## Complements Zerodha

| Source | Best for |
|--------|----------|
| **Fi** | Banks, credit cards, loans, holistic net worth |
| **Zerodha (Kite)** | Equity holdings, Coin MF, SIPs, broker cash |

Both contexts are injected into the wealth agent when connected.

## Dev probe

```bash
npx tsx scripts/wealth/fi/probe-fi-mcp.mts
# With passcode from Fi app:
npx tsx scripts/wealth/fi/probe-fi-mcp.mts YOUR_PASSCODE
```

The Fi MCP server may block some cloud/datacenter IPs (503). Test from your local machine or Railway (India-friendly region).

## Code

- `src/pillars/wealth/fi/` — MCP client, session, snapshot, prompt formatting
- `src/agents/tools/fiConnectTool.ts` — connect / ack / disconnect fast paths
- `src/agents/wealth/wealthAgent.ts` — injects Fi + Kite context

Docs: [fi.money/features/getting-started-with-fi-mcp](https://fi.money/features/getting-started-with-fi-mcp)
