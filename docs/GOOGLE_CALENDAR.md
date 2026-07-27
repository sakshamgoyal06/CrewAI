# Google Calendar

Magnus reads your schedule and creates events from chat: “what does my day look like?”, “am I free
Thursday evening?”, “book gym 7am tomorrow”. The same integration also powers an optional Cursor
MCP server for calendar work inside the IDE.

There is no calendar command. Just ask.

---

## 1. Google Cloud, once

1. [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → Enable APIs** → enable **Google Calendar API**.
3. **OAuth consent screen** → External (or Internal for Workspace) → add your own Google account
   under **Test users** while the app is in testing.
4. **Credentials → Create credentials → OAuth client ID → Desktop app** → download the JSON.

Scopes used are calendar read plus events write — nothing else.

## 2. Authorize once, locally

```bash
export GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/client_secret.json
npm run google-calendar:auth
```

Open the printed URL, approve, paste the code back. The script saves a token file for local use
**and prints a refresh token** for the deployed bot.

## 3. Give the deployed bot access

A hosted container has no browser and no persistent disk, so the token file is useless there.
Set these three variables on the host (Railway → Variables) instead:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_REFRESH_TOKEN=...
```

The refresh token does not expire unless you revoke it or leave the OAuth app in testing mode for
an extended period, so this survives redeploys. Confirm with `npm run telegram:check` — the
**Google Calendar** capability reads `ready` once all three are present.

If they are missing, Magnus says the calendar is not connected rather than inventing events.

---

## What Magnus can do

| You say | What happens |
|---|---|
| “what's on today?” | Reads today's events and describes the day — what's fixed, where the gaps are |
| “am I free Thursday evening?” | Reads that window and answers directly |
| “book gym 7am tomorrow” | Creates a one-hour event (the default when you give no end time) |
| “add dentist Tuesday 4pm for 30 minutes at Indiranagar” | Creates it with location |
| “block two hours for deep work tomorrow morning” | Creates the block |

Times are interpreted and displayed in your profile timezone (`user_profile.timezone`), not UTC.
Magnus reads before answering — it never guesses at what is on your calendar.

Reads and creates only. Updating and deleting exist in the integration layer but are not exposed to
chat yet, so Magnus cannot silently move or remove something you scheduled elsewhere.

---

## Optional: Cursor MCP server

For calendar work while coding, the same layer is exposed as a stdio MCP server.

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
# set GOOGLE_OAUTH_CREDENTIALS to your JSON path
```

Reload Cursor's MCP servers to get `list_calendars`, `list_events`, `get_free_busy`,
`create_event`, `update_event`, `delete_event`. This is IDE-only and has no effect on the bot.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| “Google Calendar is not connected” | One of the three variables is missing. `npm run telegram:check` names which. |
| `invalid_grant` in logs | The refresh token was revoked, or the OAuth app left testing. Re-run `npm run google-calendar:auth` and update the host. |
| Access blocked during authorization | Add your Google account under OAuth consent screen → Test users. |
| Events appear at the wrong hour | Check `user_profile.timezone` in Supabase; that is what Magnus formats against. |
| MCP server not loading in Cursor | Use an absolute path for `GOOGLE_OAUTH_CREDENTIALS`; run `npx tsx mcp/google-calendar/server.mts` to see stderr. |

Never commit `client_secret*.json` or `google-calendar-token.json` — both are gitignored.
