# YouTube / YT Music

Magnus searches YouTube, manages playlists, bookmarks songs and videos, cues an up-next
queue, and recommends things to watch or listen to — from plain chat.

**This is a per-user connection.** The host holds only the shared Google OAuth **Web** app
(`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Each user’s refresh token lives in
`user_integrations` — the in-chat flow stores the **same** token on both
`google_calendar_refresh_token` and `google_youtube_refresh_token` (one consent covers Calendar +
YouTube).

Preferred setup: **connect in chat** — say “connect Google” (or “connect YouTube” /
“connect Calendar”) and Magnus sends a one-time Google link. After you approve, the bot stores
both tokens and confirms on Telegram.

There is **no official YouTube Music API**. Magnus uses [YouTube Data API v3](https://developers.google.com/youtube/v3).

---

## 1. Google Cloud (once)

1. Enable **YouTube Data API v3** and **Google Calendar API**.
2. Create an OAuth client of type **Web application** (not Desktop) with this authorized redirect
   URI (exact match):

   ```
   https://<your-magnus-host>/oauth/google/callback
   ```

   Example: `https://crewai-production-c221.up.railway.app/oauth/google/callback`

   Desktop clients only allow localhost redirects, so they cannot complete the Telegram flow.
   The CLI `npm run youtube:auth` / `google-calendar:auth` (loopback) still work with a Desktop
   client if you prefer manual upsert — but the hosted bot needs the Web client on Railway.

3. Publish the OAuth app if it is still in Testing (otherwise refresh tokens expire after 7 days).
4. On Railway set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from that **Web** client.

The public base URL is taken from `MAGNUS_PUBLIC_BASE_URL`, `TELEGRAM_WEBHOOK_URL`, or
`RAILWAY_PUBLIC_DOMAIN` / Render / Fly.

Confirm the live redirect URI anytime: `GET https://<host>/oauth/google`

---

## 2. Connect in Telegram (recommended)

1. Deploy with the callback route live (`GET /oauth/google/callback` on the health server).
2. Message Magnus: **“connect Google”** (or “connect YouTube” / “connect Calendar”).
3. Open the link he sends, approve Calendar + YouTube access, close the tab.
4. Magnus confirms in chat when both tokens are saved for your `user_profile`.

The link expires in ~15 minutes. If Google does not return a refresh token (already granted
before), revoke Magnus at https://myaccount.google.com/permissions and connect again.

**Switching from a Desktop client:** replace Railway’s client id/secret with the Web client, then
connect again in chat. Old Desktop-issued refresh tokens will not work with the new client.

---

## 3. Manual fallback (CLI)

```bash
export GOOGLE_OAUTH_CREDENTIALS=/path/to/client_secret.json
npm run youtube:auth
# and/or
npm run google-calendar:auth

GOOGLE_YOUTUBE_REFRESH_TOKEN=1//...
GOOGLE_CALENDAR_REFRESH_TOKEN=1//...   # can be the same string if scopes were combined
TELEGRAM_USER_ID=<your Telegram numeric id>
npx tsx scripts/upsert-user-integrations.mts
```

---

## What Magnus can do

| You say | What happens |
|---|---|
| “connect Google” / “connect YouTube” | One consent link; stores Calendar + YouTube tokens |
| “search YouTube for lo-fi study beats” | Search with openable links |
| “create a focus playlist” / “add this to my Magnus playlist” | Your playlists |
| “bookmark this song” / “cue this for later” | Shortlist + cue queue |

---

## Troubleshooting: `redirect_uri_mismatch`

Google shows this when the URI Magnus sends is not listed on the **same** OAuth client as
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

1. Open https://\<your-magnus-host\>/oauth/google — it returns the exact `redirect_uri` and `client_id`.
2. In Google Cloud → Credentials → **that** client id:
   - Type must be **Web application**.
   - Authorized redirect URIs must include that `redirect_uri` exactly.
3. Save, wait ~1 minute, ask Magnus to connect Google again (do not reuse an old link).

For this Railway host:

```
https://crewai-production-c221.up.railway.app/oauth/google/callback
```

---

## Limits

- Cannot remote-control the phone player.
- No unofficial YT Music-only shelves.
- In-chat connect needs a public HTTPS host and a Web OAuth redirect URI.
