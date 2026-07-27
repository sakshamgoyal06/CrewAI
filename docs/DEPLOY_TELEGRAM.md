# Deploy Magnus Telegram bot (Health + Hevy)

> **Setting the bot up (BotFather, env, commands, verification)?** Start with
> **[`docs/TELEGRAM_SETUP.md`](./TELEGRAM_SETUP.md)** — this page covers hosting only.

Magnus is a **long-running Node process** (Telegram long-polling + HTTP health). **GitHub alone cannot host it** — use GitHub as the **source repo** and deploy to a small always-on host.

Recommended: **Railway** (connects to GitHub, auto-deploy on push). Alternatives: **Fly.io**, **Render**, **DigitalOcean App Platform**, or any VPS with Docker.

---

## What you get on Telegram

| Command / message | Behavior |
|-------------------|----------|
| `/menu` | Department picker |
| `/health` | Coaching with **program memory** (recovery rules, learnings, Hevy IDs) |
| `/hevy` | Create/update routines, log workouts |
| `/journal` | EOD health journal → saved to Supabase |
| Natural language | e.g. “should I train today?” uses recovery routine; “review my last workouts” pulls Hevy |

Health memory is loaded from:

- `.cursor/skills/health/references/` (shipped in Docker image)
- Your Telegram journals in `magnus_daily_logs` (metadata `health_journal: true`)

---

## 1. Create Telegram bot

See **[`docs/TELEGRAM_SETUP.md`](./TELEGRAM_SETUP.md)** for the full flow (BotFather, `npm run
telegram:setup`, verification). In short: `/newbot` in **@BotFather**, save the token as
`TELEGRAM_BOT_TOKEN`, message your bot once from your phone.

`TELEGRAM_CHAT_ID` is optional for inbound DMs (the bot replies to the chat that messaged it). Set it if you use proactive `sendMessage` / Morning Brief defaults.

---

## 2. Required secrets

Copy `.env.example` → `.env` locally, or set variables in Railway **Variables**:

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `ANTHROPIC_API_KEY` | LLM specialists |
| `SUPABASE_URL` | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes (required in production) |
| `UPSTASH_REDIS_REST_URL` | Rate limits + dedupe |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth |
| `HEVY_API_KEY` | Hevy read/write + workout analysis |
| `MAGNUS_AUTO_ALLOWLIST_NEW_USERS` | `true` while solo testing |
| `NODE_ENV` | `production` on host |

Optional:

- `MAGNUS_HEALTH_REFERENCES_DIR` — override path to health memory files (default: `.cursor/skills/health/references`)
- `MAGNUS_TELEGRAM_COMMANDS_MODE` — `core` (default), `minimal`, or `full` native command menu

Run `npm run telegram:check` against the host's variables to see which capabilities are live.

---

## 3. Deploy on Railway (GitHub-connected)

1. Push this repo to GitHub (`sakshamgoyal06/CrewAI` or your fork).
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select the Magnus repo. Railway reads `railway.toml` + `Dockerfile`.
4. Add **all secrets** from section 2 in Railway → Service → Variables.
5. Deploy. Open **Settings → Networking** → generate a public domain (for `/health` checks only; Telegram uses outbound polling).
6. Logs should show: `Magnus online (Telegram + health)`.

**Important:** Only **one** running instance per `TELEGRAM_BOT_TOKEN`. Stop local `npm run dev` before testing production.

---

## 4. Apply Supabase migrations

If not already applied on your project:

```bash
# Dashboard SQL or Supabase CLI
supabase db push
```

Needs at least: `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `user_health_profile`.

---

## 5. Verify from your phone

Run `npm run telegram:setup` once against the production token so commands and the menu button
match the deploy, then walk the checklist in
**[`docs/TELEGRAM_SETUP.md`](./TELEGRAM_SETUP.md#6-verify-from-your-phone)**.

Health check (host):

```bash
curl https://YOUR-RAILWAY-URL/health
curl https://YOUR-RAILWAY-URL/ready
```

---

## 6. Sync Cursor health memory → Telegram

Committed files under `.cursor/skills/health/references/` are **bundled in the Docker image**. To update program memory on Telegram:

1. Edit `user-context.md`, `recovery-routine.md`, `program-learnings.md`, or `journal/*.md` in Cursor.
2. Commit + push to `main`.
3. Railway redeploys → bot loads new files on restart.

Telegram-only journals live in **Supabase** and merge automatically (no redeploy needed).

---

## Other hosts

| Host | Notes |
|------|-------|
| **Fly.io** | `fly launch` + `fly secrets set` — use same Dockerfile |
| **Render** | Web Service, Docker, `npm run start:prod` |
| **VPS** | `docker compose -f docker-compose.example.yml up -d` |
| **GitHub Actions** | ❌ Not for long-polling bots (jobs exit). Use Actions only for CI (`ci.yml`). |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `409 Conflict` on Telegram | Another process uses the same bot token — stop duplicate dev/prod |
| `You're not allowlisted` | Set `MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true` or allowlist in Supabase |
| Hevy writes fail | `HEVY_API_KEY` missing on host |
| Recovery rules not in replies | Check deploy includes `.cursor/skills/health/references`; see logs for read errors |
| `/ready` fails | Supabase or Redis credentials wrong |

---

## Local dev (before deploy)

```bash
npm install
cp .env.example .env   # fill secrets
npm run dev
```

Message your bot while dev is running (only one poller at a time).
