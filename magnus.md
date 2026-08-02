# Magnus — project tracker

**This file is the source of truth** for what the code does and how to run it. Update it when you
ship anything that changes behaviour, dependencies, environment, or the database.

| Doc | Purpose |
|-----|---------|
| **`docs/ARCHITECTURE.md`** | What the system is: Magnus, four pillars, connections, ownership |
| **`docs/TELEGRAM_SETUP.md`** | Setting up the bot and keeping it always on |
| **`docs/GOOGLE_CALENDAR.md`** | Calendar setup, including headless auth for the deploy |
| **`docs/YOUTUBE.md`** | YouTube / YT Music setup (search, playlists, bookmarks, cue) |
| **`MAGNUS_CORE_CONTEXT.md`** | Product intent and philosophy |

---

## What Magnus is

A single-user Telegram bot that supports **multiple users** when provisioned per `user_profile`. The user writes plain language; Magnus answers in one voice. Each turn
is silently classified to one of five intents — four pillars plus Magnus's own work — and a
specialist may write the answer, but the user is never told and cannot address one directly.

**There are exactly two commands: `/start` and `/help`.** Both are answered locally with no model
call. No menu, no lane picker, no per-department commands.

| Owner | Scope |
|---|---|
| **Magnus** (`GENERAL`) | The day and week, Google Calendar, YouTube / YT Music, journaling and logging, reminders, cross-pillar questions, ordinary conversation. The only agent with tools. |
| **Health** | Training, workouts, meals and macros, sleep, recovery, the health journal. Deep: sub-router, Hevy, nutrition providers, program memory, onboarding gate. |
| **Wealth** | Budgeting, spending, saving, debt, net worth, financial goals, investing philosophy. |
| **Happiness** | Books, film, music, games, hobbies, creative practice, rest, travel, relationships. |
| **Wisdom** | Learning plans, skills and craft, career direction and growth, shipping projects. |

Wealth, Happiness and Wisdom are single prompt-only agents sharing one runner
(`src/agents/pillarSpecialist.ts`) — intentionally shallow until a pillar earns depth.

---

## Quick facts

| Item | Detail |
|------|--------|
| **Runtime** | Node.js ≥ 20, TypeScript ESM, `tsx` for dev |
| **Entry** | `src/index.ts` |
| **Interface** | Telegram (Telegraf) — long polling or webhook |
| **Health HTTP** | Express on `HEALTH_PORT`/`PORT`: `GET /health`, `GET /ready`, `GET /oauth/youtube` (shows redirect URI), `GET /oauth/youtube/callback`, `POST /internal/jobs/morning-brief` |
| **Model** | `claude-sonnet-4-6` for classification and every agent |
| **Supabase project** | `xdrpjfdhduskhzryevze` (ap-northeast-1) |
| **Logging** | pino JSON; Telegram user ids masked in production |
| **Deploy** | Railway from `Dockerfile` + `railway.toml` (restart ALWAYS, one replica) |

---

## Quick start

```bash
npm install
cp .env.example .env          # fill the six required values
npm run telegram:check        # what your env enables, and what Telegram currently holds
npm run telegram:setup        # register /start + /help, menu button, profile text
npm run dev
```

**Required to boot:** `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Set
`MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true` or new Telegram users get a refusal.

`npm test` needs the dummy Supabase/Anthropic/Redis values from `.github/workflows/ci.yml` in your
shell or `.env`.

---

## Source layout

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | Boot: clients → capability log → Telegram runtime → health server → watchdog → graceful shutdown |
| `src/magnus.ts` | Turn handler: allowlist gate, chat persistence, typing indicator, orchestrator call. Starts the Morning Brief cron. |
| `src/agents/magnusOrchestrator.ts` | Health onboarding gate → classify → memory → pillar specialist or Magnus |
| `src/agents/orchestratorIntent.ts` | The five-way classifier, plus the one coercion (explicit meal log → HEALTH) |
| `src/agents/magnusAgent.ts` | Magnus himself: calendar, YouTube, event log, journaling, reminders — tool loop |
| `src/agents/tools/calendarTool.ts` | Google Calendar; per-user tokens; delete/update sync linked `magnus_events` rows |
| `src/agents/tools/youtubeTool.ts` | YouTube / YT Music: search, recommend, playlists, bookmarks, cue (per-user token) |
| `src/agents/tools/eventLogTool.ts` | Event log tools: plan, update, reschedule, list (`magnus_events`) |
| `src/agents/tools/logNoteTool.ts` | Journal note → `magnus_daily_logs`, mirrored to Notion when configured; can link to an event |
| `src/users/` | Per-user program memory (`user_program_memory`) and integrations (`user_integrations`) |
| `src/events/` | Event log domain: timezone helpers, Supabase store, calendar sync, formatting |
| `src/youtube/` | Bookmarks, cue queue, and Magnus playlist state in Supabase |
| `src/agents/registry.ts` | The four pillar agents; first match on intent wins |
| `src/agents/pillarSpecialist.ts` | Shared runner for Wealth, Happiness, Wisdom |
| `src/agents/health/healthRouter.ts` | Health composite: meal log → journal → Hevy write → fitness → nutrition |
| `src/agents/health/healthOnboarding.ts` | Four-question gate on `user_health_profile` |
| `src/agents/memory/` | `loadMemoryContext`, `formatMemoryBlockForSystem`, `augmentUserWithMemory` |
| `src/agents/routing/intentToPillarRoute.ts` | Intent → pillar label for metadata |
| `src/meals/` | Meal parsing, estimate chain (web search → USDA → CalorieNinjas → optional LLM), `meal_logs` writes |
| `src/pillars/health/workouts/` | Hevy client, fitness agent, Hevy write agent |
| `src/pillars/health/references/` | Reads committed program memory + Telegram journals |
| `src/jobs/` | Morning Brief: prompt, context, cron, timezone window. Optional. |
| `src/tools/telegram.ts` | Telegraf bot, `/start` and `/help`, rate limit, update dedupe, webhook mount |
| `src/tools/telegramWatchdog.ts` | Liveness probe; exits so the host restarts |
| `src/config/telegramRuntime.ts` | Polling vs webhook, public URL derivation, handler timeout |
| `src/config/telegramCommands.ts` | The two registered commands (import-free, so the CLI needs no credentials) |
| `src/config/magnusCapabilities.ts` | Env → capability report for `telegram:check` and the boot log |
| `src/healthServer.ts` | `/health`, `/ready`, Morning Brief job route, Telegram webhook route, YouTube OAuth callback (`GET /oauth/youtube/callback`) |
| `src/integrations/googleCalendar/` | OAuth (env refresh token or local token file) + Calendar operations |
| `src/integrations/youtube/` | OAuth / API key + Data API operations + in-chat OAuth flow |
| `src/config/publicBaseUrl.ts` | Public HTTPS base for OAuth redirect URIs |
| `mcp/google-calendar/server.mts` | Optional stdio MCP server for Cursor — not part of the bot |

---

## Behaviour

1. **Identity** — Each Telegram user is keyed by `ctx.from.id` → `user_profile.telegram_chat_id` → canonical `user_profile.id`. Personalised fields: `display_name`, `timezone`, `north_star_goal`, `user_tier`, `access_flags`. New users get neutral defaults (`timezone: UTC`); owner seeding via `scripts/provision-owner-user.mts`.
2. **Access** — `allowlisted`, `user_tier`, `access_flags` on `user_profile`. Not allowlisted means
   a fixed refusal and no chat rows.
3. **Rate limit** — Redis fixed 60s window per user (`MAGNUS_RATE_LIMIT_PER_MINUTE`, 0 disables).
4. **Dedupe** — `update_id` claimed in Redis for 24h, so webhook retries never double-reply.
5. **Classification** — Five intents. `GENERAL` is Magnus's own work, not a fallback bucket.
   Explicit meal logs coerce to `HEALTH`; YouTube / YT Music actions coerce to `GENERAL` so
   Magnus tools run (Happiness stays taste-only).
6. **Memory** — Loaded once per turn: recent chat as verbatim `messages[]` (configurable window), rolling summary for older turns, semantic facts from `memory_summaries`, plus structured profile/goals/logs. Tunable via `MAGNUS_MEMORY_*` in `.env.example`. Post-turn maintenance updates conversation summary and extracted facts.
7. **Persistence** — `magnus_chat_messages` gets a user row and an assistant row per turn, with
   routing in `metadata` (`delegated_agent`, `agent_metadata`).
8. **Replies** — One reply per turn, chunked only for Telegram's size limit, sent as HTML.
9. **Event log** — Magnus tools `log_event`, `update_event`, `reschedule_event`, `list_events` write
   to `magnus_events`. Moving a commitment closes the old row and opens a linked replacement (never
   edits time in place). A second `log_event` for the same activity with a different time within two
   hours is rejected — Magnus must call `reschedule_event` instead. Calendar delete/update cancels or
   reschedules the linked event-log row automatically. Memory and the Morning Brief read commitments
   around today plus per-activity adherence from `magnus_event_activity_stats`.
10. **YouTube** — Per-user connection (`user_integrations.google_youtube_refresh_token`). In chat:
    “connect YouTube” → `connect_youtube` sends a Google consent link; `GET /oauth/youtube/callback`
    stores the token and confirms on Telegram. Also: search, playlists, bookmarks, cue.

---

## Database

**Written:** `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `magnus_events`, `meal_logs`,
`user_health_profile`, `user_program_memory`, `user_integrations`, `memory_summaries` (Phases 2–3:
rolling summary + semantic facts), `magnus_youtube_bookmarks`, `magnus_youtube_cues`,
`magnus_youtube_state`.

**Read only:** `workouts`, `goals`, `daily_scores`, `happiness_reserve`,
`patterns`, `life_patterns`, `pillar_status`, `kpi_readings`, `magnus_insights`, `daily_plans`,
`magnus_events_open`, `magnus_event_activity_stats`.

Public tables use RLS with a `service_role_only` policy; the service role key bypasses it. The new
Supabase `sb_secret_…` key format works as service role.

`supabase/migrations/` covers `magnus_daily_logs`, `user_health_profile`, `meal_logs`,
`magnus_events`, `memory_summaries`, and `magnus_youtube_*` — older schema was applied directly to the project before
those migrations existed.

---

## Environment

See `.env.example`, which is grouped by purpose. Highlights beyond the six required values:

- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** — shared OAuth app on the host (Railway).
  Per-user refresh tokens live in `user_integrations`.
- **Per-user keys** (Hevy, Notion, calendar + YouTube refresh tokens) — in Supabase
  `user_integrations`. Seed with `npx tsx scripts/upsert-user-integrations.mts` (local `.env`),
  not Railway. See `docs/YOUTUBE.md` / `docs/GOOGLE_CALENDAR.md`.
- **`USDA_FDC_API_KEY`, `CALORIENINJAS_API_KEY`** — meal macros (platform-level).
- **`MAGNUS_TELEGRAM_MODE=webhook`** — recommended on a host; no 409 on overlapping deploys.
- **`MAGNUS_MORNING_BRIEF_CRON_ENABLED`** — the unprompted daily push (off by default).

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch mode |
| `npm run build` / `npm start` | Compile to `dist/`, run compiled |
| `npm test` | Vitest unit tests |
| `npm run telegram:check` | Capability report + current Telegram config (`-- --json`, `-- --probe-conflict`) |
| `npm run telegram:setup` | Apply Telegram config: webhook, commands, menu button, description |
| `npm run test:supabase` | Supabase insert/delete smoke test (+ `memory_summaries` reachable) |
| `npm run db:apply -- supabase/migrations/<file>.sql` | Apply a migration via direct Postgres (`SUPABASE_DB_PASSWORD`) |
| `npm run google-calendar:auth` | One-time OAuth; prints the refresh token for the host |
| `npm run youtube:auth` | One-time YouTube OAuth; prints refresh token to store in `user_integrations` |
| `npx tsx scripts/dev/import-graph.mts` | Dead-code audit — should report zero orphans |
| `npx tsx scripts/provision-owner-user.mts` | Wipe + recreate owner `user_profile`, seed program memory and integrations |
| `npx tsx scripts/upsert-user-integrations.mts` | Update `user_integrations` for a user without wiping data |

---

## Operations

- **Always on** — `docs/TELEGRAM_SETUP.md` → "Keeping it always on". Railway restarts `ALWAYS`, one
  replica, healthcheck on `/health`.
- **Webhook vs polling** — Only one process may poll a token; webhook mode makes overlapping
  deploys harmless. `npm run telegram:check -- --probe-conflict` detects a duplicate poller.
- **Watchdog** — Probes Telegram every 60s and exits non-zero after five failures so the host
  restarts. Also re-registers a drifted webhook.
- **Uptime** — Railway only healthchecks at deploy time; add an external ping on `/ready`.
- **Secrets** — Never commit `.env`. Rotate anything that has been pasted anywhere.

---

## Not built yet

- **Memory reads tables nothing writes.** Fifteen read-only tables can produce `gaps` every turn when
  `MAGNUS_MEMORY_INCLUDE_GAPS=true` (default off). Phases 2–3 write to `memory_summaries` after each
  turn when enabled (requires the `memory_summaries` migration applied).
- **Schema not reproducible** from `supabase/migrations/` for tables predating April 2026 migrations.
- **Semantic recall** — no embeddings; memory is recent-window plus structured reads.
- **Wealth, Happiness, Wisdom are shallow** — one prompt each, no tools or data.
- **Morning Brief does not read Google Calendar** — it reads the event log and LifeOS tables.
- **No E2E tests** against live Telegram, Supabase, Hevy, Google Calendar or YouTube.

**Hevy in Telegram:** Fitness turns inject the last 5 Hevy list rows with **full per-set detail** (weight×reps or duration) via `formatHevyWorkoutsForPrompt` — not headline-only summaries.

---

**Last updated:** 2026-08-02 (YouTube connect-in-chat OAuth onboarding via Telegram link + callback)
