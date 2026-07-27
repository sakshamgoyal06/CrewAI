# Magnus — project tracker

**This file is the source of truth** for what the code does and how to run it. Update it when you
ship anything that changes behaviour, dependencies, environment, or the database.

| Doc | Purpose |
|-----|---------|
| **`docs/ARCHITECTURE.md`** | What the system is: Magnus, four pillars, connections, ownership |
| **`docs/TELEGRAM_SETUP.md`** | Setting up the bot and keeping it always on |
| **`docs/GOOGLE_CALENDAR.md`** | Calendar setup, including headless auth for the deploy |
| **`MAGNUS_CORE_CONTEXT.md`** | Product intent and philosophy |

---

## What Magnus is

A single-user Telegram bot. The user writes plain language; Magnus answers in one voice. Each turn
is silently classified to one of five intents — four pillars plus Magnus's own work — and a
specialist may write the answer, but the user is never told and cannot address one directly.

**There are exactly two commands: `/start` and `/help`.** Both are answered locally with no model
call. No menu, no lane picker, no per-department commands.

| Owner | Scope |
|---|---|
| **Magnus** (`GENERAL`) | The day and week, Google Calendar, journaling and logging, reminders, cross-pillar questions, ordinary conversation. The only agent with tools. |
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
| **Health HTTP** | Express on `HEALTH_PORT`/`PORT`: `GET /health`, `GET /ready`, `POST /internal/jobs/morning-brief` |
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
| `src/agents/magnusAgent.ts` | Magnus himself: tool loop over calendar read/create and `log_note` |
| `src/agents/tools/calendarTool.ts` | Google Calendar as text for the model, formatted in the user's timezone |
| `src/agents/tools/logNoteTool.ts` | Journal note → `magnus_daily_logs`, mirrored to Notion when configured |
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
| `src/healthServer.ts` | `/health`, `/ready`, Morning Brief job route, Telegram webhook route |
| `src/integrations/googleCalendar/` | OAuth (env refresh token or local token file) + Calendar operations |
| `mcp/google-calendar/server.mts` | Optional stdio MCP server for Cursor — not part of the bot |

---

## Behaviour

1. **Identity** — Each Telegram user is keyed by `ctx.from.id`, stored in
   `user_profile.telegram_chat_id` (legacy column name).
2. **Access** — `allowlisted`, `user_tier`, `access_flags` on `user_profile`. Not allowlisted means
   a fixed refusal and no chat rows.
3. **Rate limit** — Redis fixed 60s window per user (`MAGNUS_RATE_LIMIT_PER_MINUTE`, 0 disables).
4. **Dedupe** — `update_id` claimed in Redis for 24h, so webhook retries never double-reply.
5. **Classification** — Five intents. `GENERAL` is Magnus's own work, not a fallback bucket.
6. **Memory** — Loaded once per turn and appended to the prompt; missing optional tables surface as
   `gaps` rather than failing.
7. **Persistence** — `magnus_chat_messages` gets a user row and an assistant row per turn, with
   routing in `metadata` (`delegated_agent`, `agent_metadata`).
8. **Replies** — One reply per turn, chunked only for Telegram's size limit, sent as HTML.

---

## Database

**Written:** `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `meal_logs`,
`user_health_profile`.

**Read only:** `workouts`, `goals`, `memory_summaries`, `daily_scores`, `happiness_reserve`,
`patterns`, `life_patterns`, `pillar_status`, `kpi_readings`, `magnus_insights`, `daily_plans`.

Public tables use RLS with a `service_role_only` policy; the service role key bypasses it. The new
Supabase `sb_secret_…` key format works as service role.

`supabase/migrations/` covers `magnus_daily_logs`, `user_health_profile` and `meal_logs` only —
everything else was applied directly to the project and **cannot be rebuilt from this repo**.

---

## Environment

See `.env.example`, which is grouped by purpose. Highlights beyond the six required values:

- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALENDAR_REFRESH_TOKEN`** — calendar on a
  host with no browser or disk. See `docs/GOOGLE_CALENDAR.md`.
- **`HEVY_API_KEY`** — real workout data for the Health pillar.
- **`NOTION_TOKEN` + `NOTION_DAILY_LOG_PARENT_PAGE_ID`** — mirror journal notes to Notion.
- **`USDA_FDC_API_KEY`, `CALORIENINJAS_API_KEY`** — meal macros.
- **`MAGNUS_TELEGRAM_MODE=webhook`** — recommended on a host; no 409 on overlapping deploys.
- **`MAGNUS_MORNING_BRIEF_CRON_ENABLED`** — the unprompted daily push (off by default).
- **`TELEGRAM_CHAT_ID`** — default outbound chat for proactive messages.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch mode |
| `npm run build` / `npm start` | Compile to `dist/`, run compiled |
| `npm test` | Vitest unit tests |
| `npm run telegram:check` | Capability report + current Telegram config (`-- --json`, `-- --probe-conflict`) |
| `npm run telegram:setup` | Apply Telegram config: webhook, commands, menu button, description |
| `npm run test:supabase` | Supabase insert/delete smoke test |
| `npm run google-calendar:auth` | One-time OAuth; prints the refresh token for the host |
| `npx tsx scripts/dev/import-graph.mts` | Dead-code audit — should report zero orphans |
| `npx tsx scripts/health/workouts/hevy/hevy-*.mts` | Hevy read/search/smoke helpers |

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

- **Memory reads tables nothing writes.** Fifteen read-only tables produce `gaps` every turn.
  Either write to them or stop reading them. Largest open item.
- **Schema not reproducible** from `supabase/migrations/`.
- **Calendar is read + create only.** No update or delete from chat, deliberately.
- **Semantic recall** — no embeddings; memory is recent-window plus structured reads.
- **Wealth, Happiness, Wisdom are shallow** — one prompt each, no tools or data.
- **Morning Brief does not read the calendar** — it predates the calendar tools.
- **No E2E tests** against live Telegram, Supabase, Hevy or Google.

---

**Last updated:** 2026-07-27 (four pillars + Magnus-only surface; Google Calendar wired into chat;
`/menu`, department commands, delegation notices, Planner, Notion agent, Research and the wealth /
joy / wisdom specialist sets removed)
