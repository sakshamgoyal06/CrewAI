# YouTube / YT Music

Magnus searches YouTube, manages playlists, bookmarks songs and videos, cues an up-next
queue, and recommends things to watch or listen to — from plain chat. There is no YouTube
command. Just ask.

**This is a per-user connection**, not a Railway/core secret. The host only holds the shared
Google OAuth app (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Your YouTube refresh token lives
in Supabase `user_integrations.youtube_refresh_token`, same pattern as Calendar and Hevy.

There is **no official YouTube Music API**. Magnus uses the [YouTube Data API v3](https://developers.google.com/youtube/v3). Music searches use the Music category; song links open on
`music.youtube.com`. Playlists you create here show up in YouTube Music when the items are music.

---

## 1. Google Cloud (once — you already enabled the API)

1. Same Google Cloud project as Calendar is fine.
2. **YouTube Data API v3** enabled (done).
3. Reuse the OAuth **desktop** client (`GOOGLE_OAUTH_CREDENTIALS` / `GOOGLE_CLIENT_ID` + `SECRET`).
4. Publish the OAuth app if it is still in Testing (otherwise refresh tokens die after 7 days).

## 2. Authorize your Google account (local)

```bash
git pull
export GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/client_secret.json
# or: export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
npm run youtube:auth
```

Approve YouTube access in the browser. The script prints a refresh token.

## 3. Store it as *your* user connection (not on Railway)

```bash
# local .env only — never commit, never set on the host
GOOGLE_YOUTUBE_REFRESH_TOKEN=1//...   # from youtube:auth
TELEGRAM_USER_ID=7174221900           # your Telegram numeric id
npx tsx scripts/upsert-user-integrations.mts
```

That writes `user_integrations.youtube_refresh_token` for your `user_profile`. Other users can
connect their own accounts the same way.

On Railway you only need:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

(same pair Calendar already uses). Confirm with `npm run telegram:check` — **YouTube / YT Music**
reads `ready` when the platform OAuth app is set; the per-user token is what actually unlocks
playlists for you.

---

## What Magnus can do

| You say | What happens |
|---|---|
| “search YouTube for lo-fi study beats” | Searches; returns titles + openable links |
| “find the song Blinding Lights on YT Music” | Music-category search |
| “recommend something like this video …” | Similar picks from a seed or mood |
| “create a focus playlist” / “add this to my Magnus playlist” | Creates or updates *your* playlists |
| “load my Magnus playlist” | Lists items |
| “bookmark this song” | Saves to Magnus shortlist (+ likes on YouTube) |
| “cue this for later” / “what's up next?” | Your cue queue in Supabase |

Bookmarks and the cue live in `magnus_youtube_bookmarks` / `magnus_youtube_cues`. The default
Magnus playlist id is in `magnus_youtube_state`.

---

## Limits

- Cannot remote-control the YouTube / YT Music player on your phone.
- No unofficial YT Music-only shelves (radio, mixes).
- Without your `youtube_refresh_token`, Magnus will say YouTube is not connected for your account.
