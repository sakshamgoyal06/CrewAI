# Google Calendar MCP (Magnus)

Local MCP server so Cursor agents can read and write your Google Calendar — useful for blocking **gym mornings**, **swim sessions**, and aligning with your weekly schedule.

## Alternatives (no self-host)

| Option | Notes |
|--------|--------|
| [Google Calendar MCP (official, remote)](https://developers.googleblog.com/en/google-workspace-mcp-servers-developer-preview/) | `https://calendarmcp.googleapis.com/mcp/v1` — OAuth via Google; Developer Preview |
| [@cocal/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp) | Popular community server; similar tool set |

Magnus ships a **minimal stdio MCP** wired to the same `googleapis` layer under `src/integrations/googleCalendar/` so runtime code can reuse calendar ops later (e.g. planner agent).

## Setup

### 1. Google Cloud project

1. [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → Enable APIs** → enable **Google Calendar API**.
3. **OAuth consent screen** → External (or Internal for Workspace) → add your Google account as a **test user** while in testing mode.
4. **Credentials → Create credentials → OAuth client ID** → **Desktop app** → download JSON.

### 2. Environment

```bash
export GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/client_secret_....json
```

Optional in `.env` (see `.env.example`):

```bash
GOOGLE_OAUTH_CREDENTIALS=/path/to/client_secret.json
GOOGLE_CALENDAR_TOKEN_PATH=~/.config/magnus/google-calendar-token.json
```

Token is stored at `~/.config/magnus/google-calendar-token.json` by default (not committed).

### 3. Authorize once

```bash
npm run google-calendar:auth
```

Open the URL, approve access, paste the code. Refresh tokens are saved automatically.

### 4. Cursor MCP config

Copy the example and set your credentials path:

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
# edit GOOGLE_OAUTH_CREDENTIALS to your JSON path
```

Reload Cursor MCP servers. You should see tools: `list_calendars`, `list_events`, `get_free_busy`, `create_event`, `update_event`, `delete_event`.

## Example prompts (health / schedule)

- “List my events for the next 7 days and mark which mornings are free for gym.”
- “Create a recurring-style week: Mon–Fri 7:00–8:30 AM gym blocks on primary calendar (create one event per day this week).”
- “Add swim lesson Saturday 10:00 AM, 45 minutes, title Swim lesson.”
- “What’s on my calendar tomorrow before 9 AM?”

Use **Asia/Kolkata** (or your `TZ`) in `start.timeZone` / `end.timeZone` when creating timed events.

## Tools reference

| Tool | Purpose |
|------|---------|
| `list_calendars` | Accessible calendars |
| `list_events` | Events in a window; optional text `query` |
| `get_free_busy` | Busy intervals for one or more calendar ids |
| `create_event` | New event (timed or all-day) |
| `update_event` | Patch summary, times, location, etc. |
| `delete_event` | Remove by event id |

## Troubleshooting

- **Invalid grant / token expired** — run `npm run google-calendar:auth` again.
- **Access blocked** — add your Google account under OAuth consent screen → Test users.
- **MCP not loading** — use absolute path for `GOOGLE_OAUTH_CREDENTIALS`; run `npx tsx mcp/google-calendar/server.mts` manually to see errors (server uses stdio; errors go to stderr).

## Security

- Never commit `client_secret*.json` or `google-calendar-token.json`.
- Scopes are calendar read/write only (`calendar` + `calendar.events`).
