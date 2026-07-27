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
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Rate limit, update dedupe, `/menu` lane state (`REDIS_URL` / `REDIS_TOKEN` also accepted) |

**Per purpose — set the ones you actually want:**

| Purpose | Variables | Without it |
|---------|-----------|------------|
| Allowlist yourself | `MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true` | New Telegram users get a refusal until you flip `user_profile.allowlisted` by hand |
| Workouts (`/workouts`, `/hevy`) | `HEVY_API_KEY` | Coaching only; no Hevy reads or writes |
| Meals (`/meal`) | `USDA_FDC_API_KEY`, `CALORIENINJAS_API_KEY` | Falls back to web research; meals still log, macros are rougher |
| Research (`/research`) | `MAGNUS_SERPAPI_KEY` | Works only on URLs or text you paste |
| Notion (`/notion`) | `NOTION_TOKEN` + at least one of `NOTION_DAILY_LOG_PARENT_PAGE_ID`, `NOTION_GOALS_DATABASE_ID`, `NOTION_DAILY_CHECKINS_DATABASE_ID` | The Notion agent replies that it is not configured |
| Morning Brief push | `MAGNUS_MORNING_BRIEF_CRON_ENABLED=true`, `MAGNUS_MORNING_BRIEF_LOCAL_HOUR`, `TELEGRAM_CHAT_ID` | `/morningbrief` still works on demand; nothing arrives on its own |
| Morning Brief over HTTP | `MAGNUS_INTERNAL_JOB_SECRET` | `POST /internal/jobs/morning-brief` is rejected |
| Native command menu | `MAGNUS_TELEGRAM_COMMANDS_MODE` (`core` default, `minimal`, `full`) | Core lanes only |

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
npm run telegram:setup -- --mode=full        # register every lane in the native menu
npm run telegram:setup -- --drop-pending     # skip the backlog after downtime
npm run telegram:check -- --probe-conflict   # ask Telegram whether another process is polling
npm run telegram:check -- --json             # machine-readable capability report
```

`--probe-conflict` issues one `getUpdates` call, which briefly interrupts a running poller. Use it
when you suspect a duplicate deploy, not as a routine check.

### Command modes

| Mode | Native menu shows | Use when |
|------|-------------------|----------|
| `core` (default) | `/menu`, `/help`, `/meal`, `/journal`, `/health`, `/workouts`, `/hevy`, `/plan`, `/research`, `/morningbrief` | Everyday personal use |
| `minimal` | `/menu`, `/help`, `/meal` | You prefer a nearly empty menu and drive everything from `/menu` |
| `full` | Every lane, including wealth and joy | You want one tap to any specialist |

Every lane stays reachable in any mode: type it, or use the `/menu` inline picker. A command sent
with no text uses its default prompt, so tapping one from the menu never wastes a turn.

---

## 5. Run exactly one poller

Telegram allows a single long-poller per token. Two processes means `409 Conflict` and messages
landing at random.

Local:

```bash
npm run dev
```

Production (Railway reads `railway.toml` + `Dockerfile`; see `docs/DEPLOY_TELEGRAM.md` for
alternatives):

- `NODE_ENV=production`
- `SUPABASE_SERVICE_ROLE_KEY` set
- one replica
- health checks on `/health` and `/ready`

Before testing production, stop `npm run dev`.

---

## 6. Verify from your phone

| Send | Expect |
|------|--------|
| `/start` | Welcome text explaining plain text, `/menu`, and slash commands (answered locally, no model call) |
| `/help` | Every lane grouped by pillar |
| `/menu` → tap **Health** → “should I train today? knees sore” | Reply that reflects your recovery rules and recent sessions |
| `/meal 2 eggs, toast, black coffee` | Logged with macros and a running day total |
| `/journal rest day, slept 6h, skipped Push B` | Saved confirmation; later health replies reference it |
| `/workouts` (with `HEVY_API_KEY`) | References your real recent Hevy sessions |
| `/research best evidence on creatine timing` | Structured answer with sources |
| `/morningbrief` | Brief generated on demand |

Host checks:

```bash
curl https://YOUR-HOST/health
curl https://YOUR-HOST/ready
```

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| Bot silent, no logs | A webhook is still set, or nothing is polling. Run `npm run telegram:check`. |
| `409 Conflict` in logs | Two pollers on one token. Stop local dev or the duplicate deploy; confirm with `--probe-conflict`. |
| “You're not allowlisted” | Set `MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true`, or set `allowlisted = true` on your `user_profile` row. |
| Menu shows the wrong commands | Re-run `npm run telegram:setup`. Telegram caches per client; force-close the app if it lingers. |
| Replies are generic, never specialist | Missing `ANTHROPIC_API_KEY` or the message routed to `GENERAL` — try the explicit slash command. |
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
