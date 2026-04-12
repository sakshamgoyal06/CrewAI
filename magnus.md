# Magnus — project tracker

**This file (`magnus.md` at the repository root) is the single source of truth** for what the codebase does, what was integrated with Supabase, and how to run and extend the project. Update it when you ship meaningful changes.

---

## Current status (2026-04-12)

**Verdict:** The **base is ready** to move on to **subagents** and **filling domain tables**, as long as you complete the **owner checklist** below. The stack is **production-oriented** (structured logging, health checks, timeouts, RLS policies, rate limits, CI build+test), but **full product QA** (E2E, load, staging deploy) is still ahead — that is normal before “overall product” testing.

| Area | State |
|------|--------|
| **Runtime** | Telegram bot + health HTTP + typed TS + `npm run build` / `npm test` / CI workflow |
| **Database** | Schema + FKs to `user_profile`, RLS + `service_role_only` on public tables, constraints/indexes per hardening pass; data was truncated during audit — **you seed or create rows** as you build features |
| **App ↔ DB** | **Wired today:** `user_profile`, `magnus_chat_messages`. **Not wired yet:** goals, KPIs, tasks, agents tables — **next phase** |
| **Agents** | No `src/agents/` yet — **planned next** |

### Your checklist before the next phase (nothing blocking in code)

1. **`.env`** — Copy from `.env.example`, fill all secrets; never commit `.env`.
2. **Local chat access** — Set **`MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true`** while developing, or new Telegram users get `allowlisted: false`.
3. **Production deploy** — Set **`NODE_ENV=production`** and **`SUPABASE_SERVICE_ROLE_KEY`** (required); point your orchestrator at **`/health`** and **`/ready`**; ensure **one** process long-polls each Telegram bot token.
4. **Supabase** — Confirm project **`xdrpjfdhduskhzryevze`** (or your target) matches migrations you expect; re-run smoke: `npx tsx scripts/test-supabase.mts` after credential changes.
5. **CI** — Push to GitHub with **Actions enabled** so `.github/workflows/ci.yml` runs (optional but recommended).
6. **Secrets hygiene** — Rotate any key ever exposed; restrict Supabase Dashboard access.

**You do not need** to finish E2E or full monitoring before starting subagents and DB writes — add those in parallel as the product matures.

---

## Next steps when resuming

1. **Subagents in parallel** — Add specialist agents (e.g. `src/agents/` or your chosen layout), register them with the orchestrator, and extend routing from `handleMessage` / `createMagnus().start()` as the design solidifies. Prefer **parallel workstreams** (multiple agents at once) once interfaces are clear.

2. **Database usable, then hosted bot** — When roughly the **top 10 agents** are in place, **prove the database end-to-end**: inserts/updates with `user_profile_id`, queries your views, `npm run test:supabase`, and any seed or smoke scripts you add. After that, **deploy to a hosted server** (Docker image + `docker-compose`, Railway, Fly.io, VPS, etc.) so the Telegram bot runs **continuously** and is **not tied to your laptop**. Use **`NODE_ENV=production`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`/health` / `/ready`** for the platform, and **one** long-poller per bot token.

---

## Git: this project is Magnus (not CrewAI-only)

The product is **Magnus**. If `git remote -v` still points at a repo named **`CrewAI`** or another unrelated name, **rename the repository on GitHub** (Settings → General → Repository name → e.g. `Magnus`) **or** create a new repo `Magnus` and point `origin` at it:

```bash
git remote set-url origin https://github.com/<your-username>/Magnus.git
git push -u origin main
```

Keep **one canonical remote** so collaborators and CI match the real project name.

---

## Quick facts

| Item | Detail |
|------|--------|
| **Runtime** | Node.js ≥ 20 (`package.json` engines) |
| **Language** | TypeScript, ESM (`"type": "module"`), `tsx` for dev |
| **Entry** | `src/index.ts` → `npm run dev` runs `tsx watch src/index.ts` |
| **Supabase project** | `xdrpjfdhduskhzryevze` (region ap-northeast-1) — use Dashboard for SQL; migrations were applied via Supabase MCP during development |
| **Primary interface** | Telegram bot (Telegraf long-polling) |
| **Health HTTP** | Express on `HEALTH_PORT` (default **8080**): `GET /health` (liveness), `GET /ready` (Supabase + Redis) |
| **Logging** | **pino** (JSON); set `LOG_LEVEL` / `NODE_ENV` |

---

## Quick start (local)

1. Clone or open this repo: `Magnus/` is the project root.
2. `npm install`
3. Copy `.env.example` → `.env` and fill secrets (never commit `.env`).
4. **Required for boot:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (recommended with RLS), `SUPABASE_ANON_KEY` (optional if service role set), `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_*` or `REDIS_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (default outbound chat for `sendMessage` without options). Set **`MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true`** for local dev if you want new Telegram users allowlisted.
5. **`NODE_ENV=production`** requires **`SUPABASE_SERVICE_ROLE_KEY`** (boot fails without it).
6. `npm run dev` — logs should show health server listening, then `Magnus online (Telegram + health)` after Telegram connects.
7. `npm test` — unit tests (no live API keys required).
8. Optional: `npx tsx scripts/test-supabase.mts` (Supabase insert/delete on `magnus_chat_messages`).

---

## Tech stack (in use vs reserved)

| Layer | Packages | Status |
|-------|----------|--------|
| Bot | `telegraf` | In use: `startBot`, `sendMessage`, `sendMarkdown`, text handler |
| LLM | `@anthropic-ai/sdk` | In use: `claude-sonnet-4-6` for classify + GENERAL replies |
| Database | `@supabase/supabase-js` | In use: profiles, chat log; service role bypasses RLS |
| Cache / rate limits | `@upstash/redis` | Required at boot; **inbound message rate limit** per Telegram user (fixed window, `MAGNUS_RATE_LIMIT_PER_MINUTE`; `0` = off) |
| Logging | `pino` | Structured JSON logs; Telegram user ids masked in production (`maskTelegramUserId`) |
| Config | `dotenv` | Loaded in `clients.ts` and `index.ts` |
| HTTP | `express` | **Health server** only (`/health`, `/ready`); not a public API surface |

---

## Source layout

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | `dotenv` → `logger` → `clients` → `startHealthServer()` → `startBot` → `handleMessage(text, telegramUserId, updateId)`. |
| `src/healthServer.ts` | Express: `/health`, `/ready` (Redis `PING` + Supabase `user_profile` head query). |
| `src/logger.ts` | `pino` instance + `maskTelegramUserId`. |
| `src/intent.ts` | `parseIntent` / `INTENTS` (pure; used by `magnus` + tests). |
| `src/magnus.ts` | `handleMessage`: resolve profile → allowlist/tier gates → classify intent → route or Claude answer → persist chat rows. |
| `src/tools/clients.ts` | Singletons: `supabase` (timeouts + `auth` for server), `redis`, `anthropic` (timeout + retries). Production requires service role key. |
| `src/tools/rateLimit.ts` | Redis fixed-window counter (60s) for inbound Telegram text (`checkMessageRateLimit`). |
| `src/tools/chatLog.ts` | `resolveTelegramUserProfile`, `recordMagnusChatMessage` (returns `{ ok }`), legacy `ensureUserProfileIdForTelegramUser`. Documents identity model in file header. |
| `src/tools/telegram.ts` | Telegraf bot; rate limit before handler; `TelegramTextHandler` receives `updateId` for logging. |
| `scripts/test-supabase.mts` | Connectivity smoke test for Supabase + chat table. |

There is **no** `src/agents/` tree yet; specialist agents are future work.

---

## Runtime behaviour (summary)

1. **Identity** — Each Telegram **user** is keyed by `ctx.from.id` (string). Profiles are stored in `user_profile.telegram_chat_id` (same string; column name is legacy).
2. **Profile resolution** — `resolveTelegramUserProfile`: find by `telegram_chat_id`; else adopt a single orphan row with null Telegram id; else insert defaults + access fields.
3. **Access (dummy)** — `allowlisted`, `user_tier`, `access_flags` on `user_profile`. Env: **`MAGNUS_AUTO_ALLOWLIST_NEW_USERS`** must be **`true`** for new profiles to get `allowlisted: true` (default **false** for safer production), `MAGNUS_DEFAULT_USER_TIER` (`standard` \| `premium` \| `internal`). If not allowlisted or `access_flags.chat === false`, return a fixed refusal string (no user/assistant chat rows for the blocked path).
4. **Rate limit** — Inbound text messages: Redis-backed fixed 60s window per Telegram user (`MAGNUS_RATE_LIMIT_PER_MINUTE`, default 30/min; `0` disables).
5. **Intent classification** — Categories: `HEALTH`, `WEALTH`, `BUILD`, `PLANNING`, `RELATIONSHIPS`, `LEARNING`, `HAPPINESS`, `GENERAL`. Non-`GENERAL` → placeholder routing message; `GENERAL` → Claude reply (warm chief-of-staff system prompt, under 100 words).
6. **Chat persistence** — Table `magnus_chat_messages`: each successful turn logs **user** then **assistant** with `user_profile_id`, `telegram_user_id`, optional `intent`, `metadata` (tier, flags, `telegram_user_id`). Proactive `sendMessage` / `sendMarkdown` logs an extra **assistant** row with `metadata.outbound`.
7. **Telegraf** — `startBot` returns a Promise resolved in the launch callback so startup logging works without awaiting the infinite polling loop.

---

## Environment variables

See **`.env.example`** for the full list. Highlights:

- **`SUPABASE_SERVICE_ROLE_KEY`** — Use for this server. **Required when `NODE_ENV=production`.** With RLS `service_role_only` policies, anon cannot read/write data.
- **`MAGNUS_SUPABASE_DB_TIMEOUT_MS`**, **`MAGNUS_ANTHROPIC_TIMEOUT_MS`**, **`MAGNUS_ANTHROPIC_MAX_RETRIES`** — Client timeouts/retries (see `.env.example`).
- **`HEALTH_PORT`** — Port for `/health` and `/ready` (default 8080).
- **`MAGNUS_RATE_LIMIT_PER_MINUTE`** — Inbound Telegram messages per user per minute (`0` = off).
- **`MAGNUS_AUTO_ALLOWLIST_NEW_USERS`** — Must be **`true`** to seed `allowlisted: true` for **new** profiles.
- **`MAGNUS_DEFAULT_USER_TIER`** — Seeded tier for new profiles.
- **`LOG_LEVEL`** — e.g. `debug`, `info`, `warn`, `error`.

---

## Database — identity and tables

### Canonical keys

| Concept | Where |
|--------|--------|
| App user (UUID) | `user_profile.id` |
| Telegram user id (string) | `user_profile.telegram_chat_id` (unique when set) + duplicated on `magnus_chat_messages.telegram_user_id` |
| Row ownership | `user_profile_id` FK on `magnus_chat_messages` and on **domain** tables (goals, tasks, health, wealth, etc.) |

### `user_profile` (relevant columns)

- `id`, `north_star_goal`, `timezone`, `telegram_chat_id`, `created_at`, `updated_at`
- `allowlisted`, `user_tier`, `access_flags` (jsonb)

### `magnus_chat_messages` (relevant columns)

- `id`, `user_profile_id`, `telegram_user_id`, `role` (`user` \| `assistant` \| `system`), `content`, `source`, `intent`, `metadata`, `created_at`
- Retention: function `purge_expired_magnus_chat_messages()` deletes rows older than 30 days (schedule via pg_cron or external job).

### Migrations (audited)

Applied on project `xdrpjfdhduskhzryevze`, including: RLS on public tables; chat table + purge function; unique partial index on `user_profile(telegram_chat_id)`; profile access columns; `telegram_user_id` on chat messages; **`user_profile_id`** added to domain tables missing it (nullable for legacy rows).

**Advisor:** Public tables use RLS with a **`service_role_only`** policy (`auth.role() = 'service_role'`); the **service role** JWT bypasses RLS for this server. **Anon** cannot read/write those tables — expected. Some **SECURITY DEFINER** views in the DB may still need review if you expose them to other roles later.

---

## Operations and troubleshooting

- **Container health** — See **`docker-compose.example.yml`** (HTTP `healthcheck` on `GET /health`) and **`Dockerfile`** (multi-stage build; inject secrets with Compose `env_file` or your host env — do not bake `.env` into the image). **`npm run start:prod`** runs `node --env-file=.env dist/index.js` after `npm run build`; set **`NODE_ENV=production`** in the env file you pass on the server. Reference template: **`.env.production.example`** (placeholders only).
- **Telegram `409 Conflict` / “terminated by other getUpdates”** — Only one process may long-poll the same bot token; stop duplicate `npm run dev` or other hosts using the same token.
- **Supabase permission errors with anon key** — Use **service role** in `.env` for this server.
- **Secrets** — Never commit real `.env` or paste keys into chats; rotate if leaked.

---

## Dependencies (`package.json`)

**Runtime:** `telegraf`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `@upstash/redis`, `dotenv`, `express`, `pino`.  
**Dev:** `tsx`, `typescript`, `vitest`, `@types/express`, `@types/node`.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch mode: `tsx watch src/index.ts` |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/index.js` |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run test:supabase` | Supabase smoke test (needs `.env` with service role + Redis) |
| `npm run start:prod` | Run compiled app with `node --env-file=.env` (run `npm run build` first). Set `NODE_ENV=production` in `.env` on the server. |
| `docker build -t magnus .` | Build production image (`Dockerfile`; secrets via runtime `env_file`, not baked in). |
| `npx tsx scripts/test-supabase.mts` | Same as `npm run test:supabase` |

---

## Not built yet (tracked)

See **Next steps when resuming** above for the main roadmap. Additionally:

- **Cron / proactive loops** (scheduled jobs, reminders).
- **Business logic** writing to domain tables (`goals`, KPIs, tasks, …) with `user_profile_id` — **schema and FKs are ready**; resolve `profileId` via `resolveTelegramUserProfile` (or your job’s user context) on every insert.
- **End-to-end / integration tests** against live Telegram or Supabase (optional hardening after features exist).

---

## Cursor (IDE) — tracker maintenance

| Artifact | Purpose |
|----------|---------|
| `.cursor/rules/magnus-md-maintenance.mdc` | **Always-on rule:** read `magnus.md` when starting real work; update it when finishing work that changes behavior, deps, env, or DB. |
| `.cursor/hooks.json` | Registers `sessionStart` / `sessionEnd` hooks. |
| `.cursor/hooks/magnus-session-start.mjs` | Injects `magnus.md` (truncated if huge) into the agent’s **additional_context** when a new Composer session starts. |
| `.cursor/hooks/magnus-session-end.mjs` | Appends a one-line reminder to `.cursor/magnus-maintenance-log.txt` (gitignored). Cursor does **not** auto-edit `magnus.md` on session end; the rule + agent still apply. |

If hooks do not run, check **Cursor Settings → Hooks** and restart Cursor after editing `hooks.json`.

---

## How to resume a session

1. Read **`magnus.md`** (this file) and **Next steps when resuming**; the **sessionStart** hook may inject a copy into context automatically.
2. Confirm **`git remote`** matches the **Magnus** repo you intend (see **Git: this project is Magnus**).
3. Ensure `.env` is complete and run `npm run dev`.
4. After DB or credential changes, run `npm run test:supabase` if you touch Supabase clients or chat logging.
5. Before ending a session with substantive changes, **update this file** and bump **Last updated** below.

**Last updated:** 2026-04-12 (next steps + Git remote note; Magnus vs CrewAI)
