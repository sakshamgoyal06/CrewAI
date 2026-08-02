# YouTube / YT Music

Magnus searches YouTube, manages playlists, bookmarks songs and videos, cues an up-next
queue, and recommends things to watch or listen to — from plain chat. There is no YouTube
command. Just ask.

There is **no official YouTube Music API**. Magnus uses the [YouTube Data API v3](https://developers.google.com/youtube/v3). Music searches use the Music category; song links open on
`music.youtube.com`. Playlists you create here show up in YouTube Music when the items are music.

---

## 1. Google Cloud, once

1. [Google Cloud Console](https://console.cloud.google.com/) → same project as Calendar is fine.
2. **APIs & Services → Enable APIs** → enable **YouTube Data API v3**.
3. OAuth consent screen already set up for Calendar: add the YouTube scope when you authorize
   (the auth script requests `youtube.force-ssl`).
4. Reuse the same OAuth **desktop** client JSON (`GOOGLE_OAUTH_CREDENTIALS`).

Quota tip: a personal bot stays well under the default daily units. Create an API key only if you
want search-without-OAuth (`YOUTUBE_API_KEY`).

## 2. Publish the OAuth app

Same rule as Calendar: while the app is in **Testing**, refresh tokens expire after **7 days**.
Publish the app (Audience → Publish app) for a personal bot.

## 3. Authorize once, locally

```bash
git pull
export GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/client_secret.json
npm run youtube:auth
```

Approve YouTube access in the browser. The script saves a local token file **and prints**
`GOOGLE_YOUTUBE_REFRESH_TOKEN` for the host.

Calendar and YouTube refresh tokens are **separate** — calendar scopes do not include YouTube.

Fallback: `npm run youtube:auth -- --manual`.

## 4. Give the deployed bot access

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_YOUTUBE_REFRESH_TOKEN=...
```

Optional:

| Variable | Purpose |
|---|---|
| `YOUTUBE_API_KEY` | Search / recommend without OAuth (playlists and likes still need the refresh token) |
| `YOUTUBE_REGION_CODE` | Region for trending picks (default `US`) |
| `YOUTUBE_MAGNUS_PLAYLIST_TITLE` | Title when creating the default Magnus playlist (default `Magnus`) |

Confirm with `npm run telegram:check` — **YouTube / YT Music** should read `ready` (or `partial`
with API key only).

---

## What Magnus can do

| You say | What happens |
|---|---|
| “search YouTube for lo-fi study beats” | Searches; returns titles + openable links |
| “find the song Blinding Lights on YT Music” | Music-category search |
| “recommend something like this video …” | Similar picks from a seed or mood |
| “what should I watch tonight?” (with YouTube connected) | Recommendations with real links |
| “create a focus playlist” / “add this to my Magnus playlist” | Creates or updates playlists |
| “load my Magnus playlist” / “what's on my YouTube playlists?” | Lists / loads items |
| “bookmark this song” | Saves to Magnus shortlist (+ likes on YouTube when OAuth is on) |
| “cue this for later” / “what's up next?” | Magnus cue queue (not YouTube autoplay) |
| “play the next one” | Pops the cue and gives you the link |

Bookmarks and the cue live in Supabase (`magnus_youtube_bookmarks`, `magnus_youtube_cues`) so they
survive across chats. The default Magnus playlist id is remembered in `magnus_youtube_state`.

---

## Limits

- Cannot control the YouTube or YT Music player on your phone (no remote “press play”).
- Cannot browse unofficial YT Music-only shelves (radio, mixes) — only Data API surfaces.
- Happiness still handles taste talk without acting on YouTube; action requests are routed to
  Magnus so the tools run.
