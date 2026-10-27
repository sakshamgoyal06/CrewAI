# Telegram bot — clean setup

The single runbook for standing up (or rebuilding) the Magnus Telegram bot so every pillar works:
health, wealth, wisdom, joy, meals, workouts, journal, Morning Brief, Notion, research.

Host-specific deploy detail lives in **`docs/DEPLOY_TELEGRAM.md`**. Product architecture lives in
**`magnus.md`** and **`docs/AGENT_ARCHITECTURE.md`**.

Two commands do the mechanical work:

```bash
npm run telegram:check   # read-only: what your env enables, what Telegram currently has
npm run telegram:setup   # applies: removes webhook, registers commands, menu button, profile text
```

---

## 1. The bot itself (BotFather)

Reuse your existing bot unless you want a new handle — the setup command reconfigures either.

**New bot:** open **@BotFather** → `/newbot` → pick a name and a `_bot` username → copy the token.

**Existing bot, clean slate:** `/mybots` → your bot →

- **API Token → Revoke** if the old token was ever pasted somewhere public. Put the new one in `.env`.
- **Bot Settings → Group Privacy → Disable** only if you plan to use Magnus inside a group. For a
  personal DM bot, leave privacy on.
- Everything else (commands, menu button, description) is set by `npm run telegram:setup` — do not
  hand-maintain the `/setcommands` list, it drifts.

Send your bot one message from your phone so the chat exists.

---

## 2. Environment

Copy `.env.example` → `.env` and fill it. On a host (Railway, Fly, VPS) set the same keys as
service variables instead of shipping a file.

**Required — the process will not boot without these:**

| Variable | Why |
|----------|-----|
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `ANTHROPIC_API_KEY` | Every specialist reply and the intent classifier |
| `SUPABASE_URL` | Profiles, chat history, meal logs, journals |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes; **required** when `NODE_ENV=production` (RLS blocks anon) |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Rate limit and update dedupe (`REDIS_URL` / `REDIS_TOKEN` also accepted) |

**Per purpose — set the ones you actually want:**

| Purpose | Variables | Without it |
|---------|-----------|------------|
| Allowlist yourself | `MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true` | New Telegram users get a refusal until you flip `user_profile.allowlisted` by hand |
| Calendar (“what's on today?”, “book gym 7am”) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` — see [`GOOGLE_CALENDAR.md`](./GOOGLE_CALENDAR.md) | Magnus says the calendar is not connected |
| Workouts (“should I train today?”) | `HEVY_API_KEY` | Coaching only; no Hevy reads or writes |
| Meals (“log lunch: rice and dal”) | `USDA_FDC_API_KEY`, `CALORIENINJAS_API_KEY` | Falls back to web search; meals still log, macros are rougher |
| Notion mirror for notes | `NOTION_TOKEN` + `NOTION_DAILY_LOG_PARENT_PAGE_ID` | Notes still save to Supabase, just not mirrored |
| Morning Brief push | `MAGNUS_MORNING_BRIEF_CRON_ENABLED=true`, `MAGNUS_MORNING_BRIEF_LOCAL_HOUR`, `TELEGRAM_CHAT_ID` | Asking Magnus about your day still works; nothing arrives unprompted |
| Morning Brief over HTTP | `MAGNUS_INTERNAL_JOB_SECRET` | `POST /internal/jobs/morning-brief` is rejected |
| Always-on hosting | `MAGNUS_TELEGRAM_MODE=webhook` (see [section 5](#5-keeping-it-always-on)) | Long polling: fine locally, collides with itself on redeploy |

`npm run telegram:check` prints this same picture from your actual environment, marking each
capability **ok**, **warn**, or **off** with the variable that would upgrade it. The bot logs the
same summary on boot.

---

## 3. Database

Apply the migrations in `supabase/migrations/` (Supabase SQL editor or `supabase db push`). At
minimum you need `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`,
`user_health_profile`, and the `meal_logs` set.

Verify credentials end-to-end:

```bash
npm run test:supabase
```

---

## 4. Configure Telegram

```bash
npm run telegram:setup
```

It does four things, all idempotent:

1. **Deletes any webhook** — Magnus long-polls, and a leftover webhook silently swallows every
   update. Add `--drop-pending` to also discard the backlog queued while the bot was down.
2. **Registers the command list** for the current mode (below), replacing whatever was there.
3. **Sets the chat menu button** to show commands.
4. **Sets the bot description and short description** shown on an empty chat and in the profile.

Useful variants:

```bash
npm run telegram:setup -- --drop-pending     # skip the backlog after downtime
npm run telegram:check -- --probe-conflict   # ask Telegram whether another process is polling
npm run telegram:check -- --json             # machine-readable capability report
```

`--probe-conflict` issues one `getUpdates` call, which briefly interrupts a running poller. Use it
when you suspect a duplicate deploy, not as a routine check.

### There are no commands to learn

Magnus registers exactly two: `/start` and `/help`, both answered locally without a model call.
Everything else is plain language — you write “what's on tomorrow?” or “log dinner: two rotis and
paneer”, and Magnus works out who answers. There is no menu, no lane picker, and no way to address
a specialist directly, by design: one voice, one thread.

---

## 5. Keeping it always on

`npm run dev` is for development only — it dies with your terminal. For a bot you can message at
3am, the process has to live on a host that restarts it. Magnus is a long-running Node process, so
it needs a container host (Railway, Fly, Render, a VPS), not a serverless platform.

### Deploy on Railway

1. Push this repo to GitHub.
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick this
   repo. Railway reads `railway.toml` and `Dockerfile`; no build config needed.
3. **Variables → Raw Editor** → paste everything from section 2, plus `NODE_ENV=production` and
   `MAGNUS_TELEGRAM_MODE=webhook`. Do **not** set `HEALTH_PORT` here; Railway injects `PORT` and
   routes to it.
4. **Settings → Networking → Generate Domain** (port `8080` if asked). This is what gives Railway's
   `RAILWAY_PUBLIC_DOMAIN`, which Magnus turns into the webhook URL by itself.
5. **Redeploy** so the new domain and variables are in the environment. The deploy before this
   crash-loops — no credentials yet — which is expected, not a broken build.
6. Logs, in order: `clients initialized`, `capabilities`, `telegram webhook route mounted`,
   `health server listening`, `starting telegram runtime` with `"mode":"webhook"`, then
   `Magnus online (Telegram + health)`.
7. Message the bot. Every push to `main` redeploys automatically.

Nothing needs to be run by hand on the host: booting in webhook mode registers the webhook and the
command list itself. `npm run telegram:setup` is for local use or repair.

If the log line reads `"mode":"polling"` with a reason mentioning no public URL, the domain did not
exist yet when the process booted — redeploy. Magnus prefers degraded polling over going dark.

`railway.toml` already pins the parts that matter: `restartPolicyType = "ALWAYS"`,
`numReplicas = 1`, healthcheck on `/health`.

### Webhook vs polling

| | Polling (default) | Webhook (`MAGNUS_TELEGRAM_MODE=webhook`) |
|---|---|---|
| Needs a public URL | No | Yes — auto-derived on Railway, Render, Fly |
| Two instances at once | `409 Conflict`, updates land at random | Harmless |
| Redeploys | Old and new instance overlap and fight | Seamless |
| Host briefly down | Updates wait in Telegram's queue | Telegram retries delivery |
| Right for | Laptop, VPS behind NAT | Any always-on host |

Webhook mode mounts a route on the same port as the health server, at an unguessable path derived
from your bot token, and rejects any request without Telegram's secret header. Set
`TELEGRAM_WEBHOOK_URL` only if the public URL is not discoverable from the platform.

If webhook mode is requested but no public URL is available, Magnus logs why and falls back to
polling rather than going dark.

### Self-healing

The failure that matters is the quiet one: the process is alive, `/health` returns 200, and
Telegram updates stopped arriving. A watchdog probes `getMe` every 60 seconds, re-registers the
webhook if it drifts (someone ran `telegram:setup` elsewhere, or Telegram dropped it after repeated
errors), and after five consecutive failures exits non-zero so the host starts a fresh process.
Tune with `MAGNUS_TELEGRAM_WATCHDOG_INTERVAL_MS` and `MAGNUS_TELEGRAM_WATCHDOG_FAILURES`; `0`
disables it.

Shutdown is graceful: `SIGTERM` stops the bot, closes the HTTP server, and exits within 10 seconds,
so redeploys do not sit through the platform's kill timeout.

### Know when it is down

Railway only runs the healthcheck at deploy time, so add an external ping — [UptimeRobot](https://uptimerobot.com)
or [Better Stack](https://betterstack.com), 5-minute interval, `GET https://YOUR-HOST/ready`, alert
to email or another Telegram bot. `/ready` checks Supabase and Redis, so it catches credential
expiry and quota problems, not just a dead process.

### Other hosts

| Host | Notes |
|------|-------|
| **Fly.io** | `fly launch` with the same Dockerfile, `fly secrets set …`; `FLY_APP_NAME` gives the webhook URL. Set `min_machines_running = 1` so it never scales to zero. |
| **Render** | Web Service from the Dockerfile; `RENDER_EXTERNAL_URL` gives the webhook URL. Avoid the free tier — it sleeps. |
| **VPS** | `docker compose -f docker-compose.example.yml up -d` with `restart: unless-stopped`. |
| **Serverless (Vercel, Lambda)** | Not supported: the Morning Brief cron and long agent turns need a process that stays up. |

Wherever you land, run `npm run telegram:setup` once with the host's variables (or from the host
shell) so the webhook and command list point at that deploy, and stop any local `npm run dev` —
in polling mode it steals updates from production.

---

## 6. Verify from your phone

| Send | Expect |
|------|--------|
| `/start` | What Magnus does, in plain language (no model call) |
| `/help` | Worked examples across calendar, health, money, learning, downtime |
| “what does my day look like?” | Your real calendar, described as a day (needs Google Calendar) |
| “book gym 7am tomorrow” | Event created, confirmed in one line |
| “log lunch: rice and dal” | Logged with macros and a running day total |
| “should I train today? knees sore” | Reply reflecting your recovery rules and recent Hevy sessions |
| “rest day, slept badly, skipped Push B” | Saved to the journal, and referenced by later replies |
| “I've decided to drop the side project” | Logged, and mirrored to Notion when configured |

Host checks:

```bash
curl https://YOUR-HOST/health
curl https://YOUR-HOST/ready
```

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| Bot silent, no logs | A webhook is still set while polling, or nothing is running. Run `npm run telegram:check`. |
| `409 Conflict` in logs | Two pollers on one token. Stop local dev or the duplicate deploy; confirm with `--probe-conflict`. Switching the host to webhook mode removes the class of problem. |
| Silent only during deploys | Polling mode with overlapping instances — use `MAGNUS_TELEGRAM_MODE=webhook`. |
| Webhook set but nothing arrives | Check `last delivery error` in `npm run telegram:check`; usually the public domain is not routing to the app, or the app was down when Telegram gave up. The watchdog re-registers automatically within a minute. |
| Bot dies overnight, no restart | Host restart policy. On Railway confirm `restartPolicyType = "ALWAYS"` took effect; on a VPS use `restart: unless-stopped`. |
| “You're not allowlisted” | Set `MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true`, or set `allowlisted = true` on your `user_profile` row. |
| Menu shows old commands | Re-run `npm run telegram:setup`. Telegram caches per client; force-close the app if it lingers. |
| Answers feel shallow on a pillar | Only Health is deep today; Wealth, Happiness and Wisdom are single prompt-only agents by design. |
| Meals log with no macros | No nutrition provider configured; see the capability table. |
| `/ready` fails | Supabase or Redis credentials are wrong on the host. |
| Flood of old messages after downtime | `npm run telegram:setup -- --drop-pending`. |

---

## Starting over cleanly

1. Stop every running instance (local `npm run dev`, host deploy).
2. `@BotFather → /mybots → API Token → Revoke`, then update `TELEGRAM_BOT_TOKEN` everywhere.
3. `npm run telegram:setup -- --drop-pending` — clears the webhook, backlog, and stale commands.
4. `npm run telegram:check` — confirm core is green and the capabilities you want are `ok`.
5. Start one process and send `/start`.

Chat history, profiles, and logs live in Supabase and survive all of the above. To reset those too,
truncate the relevant tables (see **Database** in `magnus.md`).
