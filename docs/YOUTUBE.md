# YouTube / YT Music

Magnus searches YouTube, manages playlists, bookmarks songs and videos, cues an up-next
queue, and recommends things to watch or listen to — from plain chat.

**This is a per-user connection.** The host holds only the shared Google OAuth app
(`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Each user’s refresh token lives in
`user_integrations.youtube_refresh_token`.

Preferred setup: **connect in chat** — say “connect YouTube” and Magnus sends a one-time Google
link. After you approve, the bot stores the token and confirms on Telegram.

There is **no official YouTube Music API**. Magnus uses [YouTube Data API v3](https://developers.google.com/youtube/v3).

---

## 1. Google Cloud (once)

1. Enable **YouTube Data API v3**.
2. Create (or reuse) an OAuth client. For **in-chat connect**, the client must be type
   **Web application** with this authorized redirect URI (exact match):

   ```
   https://<your-magnus-host>/oauth/youtube/callback
   ```

   Example: `https://magnus.up.railway.app/oauth/youtube/callback`

   Desktop clients only allow localhost redirects, so they cannot complete the Telegram flow.
   The CLI `npm run youtube:auth` (loopback) still works with a Desktop client if you prefer
   manual upsert.

3. Publish the OAuth app if it is still in Testing (otherwise refresh tokens expire after 7 days).
4. On Railway set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (same as Calendar is fine **only if**
   that client is Web type with the redirect URI above — otherwise use a dedicated Web client).

The public base URL is taken from `MAGNUS_PUBLIC_BASE_URL`, `TELEGRAM_WEBHOOK_URL`, or
`RAILWAY_PUBLIC_DOMAIN` / Render / Fly.

---

## 2. Connect in Telegram (recommended)

1. Deploy with the callback route live (`GET /oauth/youtube/callback` on the health server).
2. Message Magnus: **“connect YouTube”** (or “link my YT Music”).
3. Open the link he sends, approve access, close the tab.
4. Magnus confirms in chat when the token is saved.

The link expires in ~15 minutes. If Google does not return a refresh token (already granted
before), revoke Magnus at https://myaccount.google.com/permissions and connect again.

---

## 3. Manual fallback (CLI)

```bash
export GOOGLE_OAUTH_CREDENTIALS=/path/to/client_secret.json
npm run youtube:auth

GOOGLE_YOUTUBE_REFRESH_TOKEN=1//...
TELEGRAM_USER_ID=<your Telegram numeric id>
npx tsx scripts/upsert-user-integrations.mts
```

---

## What Magnus can do

| You say | What happens |
|---|---|
| “connect YouTube” | Sends a one-time Google consent link; stores your token on success |
| “search YouTube for lo-fi study beats” | Search with openable links |
| “create a focus playlist” / “add this to my Magnus playlist” | Your playlists |
| “bookmark this song” / “cue this for later” | Shortlist + cue queue |

---

## Limits

- Cannot remote-control the phone player.
- No unofficial YT Music-only shelves.
- In-chat connect needs a public HTTPS host and a Web OAuth redirect URI.
