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
4. **Credentials → Create credentials → OAuth client ID → Web application** (required for
   in-chat connect on Railway). Add authorized redirect URI
   `https://<your-magnus-host>/oauth/google/callback`. A Desktop client still works for local
   CLI auth only.

Scopes used are calendar read plus events write. In-chat **connect Google** also requests YouTube
scopes in the same consent and stores one refresh token on both Calendar and YouTube columns.

## 2. Publish the OAuth app

**Do not skip this.** While the app sits in **Testing**, Google expires refresh tokens after
**7 days**, so the bot silently loses calendar access every week.

Google Cloud → **Google Auth Platform → Audience → Publish app** (older consoles: OAuth consent
screen → Publish app). You will see an "unverified app" warning when you authorize, which is fine
for a personal bot with your own account — verification only matters for distributing to others.

## 3. Authorize once, locally

```bash
git pull
export GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/client_secret.json
npm run google-calendar:auth
```

The script opens a loopback listener, prints a URL, and waits. Approve in the browser (click
**Advanced → Go to Magnus** past the unverified warning), and it captures the code automatically —
no copy-paste. It saves a token file for local use **and prints the refresh token** for the deploy.

If the loopback port is blocked, `npm run google-calendar:auth -- --manual` falls back to pasting
the code by hand.

## 4. Give the deployed bot access

A hosted container has no browser and no persistent disk, so the token file is useless there.
Set the Web client on the host (Railway → Variables):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Then in Telegram say **“connect Google”** — Magnus stores per-user tokens in `user_integrations`
(no host-level `GOOGLE_CALENDAR_REFRESH_TOKEN` required for chat users).

For a one-off CLI seed you can still upsert:

```
GOOGLE_CALENDAR_REFRESH_TOKEN=...
```

via `scripts/upsert-user-integrations.mts`.

---

## What Magnus can do

| You say | What happens |
|---|---|
| “what's on today?” | Reads today's events and describes the day — what's fixed, where the gaps are |
| “am I free Thursday evening?” | Reads that window and answers directly |
| “book gym 7am tomorrow” | Creates a one-hour event (the default when you give no end time) |
| “add dentist Tuesday 4pm for 30 minutes at Indiranagar” | Creates it with location |
| “block two hours for deep work tomorrow morning” | Creates the block |
| “move gym to 8am” | Moves it, keeping the same duration |
| “rename Working AI Session to Deep work” | Renames it |
| “cancel swimming on Wednesday” | Deletes it, and tells you what it removed |

Times are interpreted and displayed in your profile timezone (`user_profile.timezone`), not UTC.
Magnus reads before answering — it never guesses at what is on your calendar.

Magnus has to read an event before it can change or delete one — editing works from the event id
returned by a read, never from a guess. If more than one event matches what you asked for, it asks
which one instead of picking. When it does change or remove something it names the event and the old
and new times, so a mistake is visible immediately.

A move keeps the original duration unless you give a new end time: "move gym to 8am" shifts a
one-hour session to 08:00–09:00.

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
| `invalid_grant` in logs | The refresh token expired (app still in Testing — publish it) or was revoked. Re-run the auth script and update the host. |
| Access blocked during authorization | Add your Google account under Audience → Test users, or publish the app. |
| Events appear at the wrong hour | Check `user_profile.timezone` in Supabase; that is what Magnus formats against. |
| MCP server not loading in Cursor | Use an absolute path for `GOOGLE_OAUTH_CREDENTIALS`; run `npx tsx mcp/google-calendar/server.mts` to see stderr. |

Never commit `client_secret*.json` or `google-calendar-token.json` — both are gitignored.
