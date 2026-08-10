# Magnus — project tracker

**Release:** Magnus **v1.0** — see [`docs/product/MAGNUS_VERSIONS.md`](docs/product/MAGNUS_VERSIONS.md)  
**This file is the source of truth** for what the code does and how to run it. Update it when you
ship anything that changes behaviour, dependencies, environment, or the database.

| Doc | Purpose |
|-----|---------|
| **`docs/product/MAGNUS_VERSIONS.md`** | v0 vs v1+ version history and bump policy |
| **`docs/product/VISION.md`** | Long-term product vision and philosophy (prefer over stale sections in `MAGNUS_CORE_CONTEXT.md`) |
| **`docs/product/BRD.md`** | Business requirements — stakeholders, objectives, scope |
| **`docs/product/PRD.md`** | Product requirements — user stories, functional reqs |
| **`docs/product/TRD.md`** | Technical requirements — stack, interfaces, security, deploy |
| **`docs/product/ACTIVITY_TAXONOMY.md`** | Operations · Goals · Projects activity layer |
| **`docs/product/PROJECT_DEFINITION.md`** | Project anatomy, lifecycle, UX |
| **`docs/diagrams/ARCHITECTURE_DIAGRAMS.md`** | Mermaid diagrams: context, sequence, routing, deployment |
| **`docs/TOOLS_AND_AGENTS.md`** | Repo diagram: agents, tools, proactive jobs, integrations |
| **`docs/USER_QUERY_GUIDE.md`** | What users can ask → routing path and expected output |
| **`docs/DATABASE_SCHEMA.md`** | Full Postgres + Redis schema, ERD, migration index |
| **`docs/review/IMPARTIAL_REVIEW_2026-08-04.md`** | Third-party code review, grades, cleanup plan |
| **`docs/review/REGRADE_2026-08-04.md`** | Post-security cleanup re-grade (B+ 84/100) |
| **`docs/review/GOLDEN_PATH_TEST_RESULTS.md`** | 100 golden-path integration tests — routing, tools, one voice |
| **`docs/review/AUDIT_2026-08-09.md`** | Full-repo audit: security, coherence, test results |
| **`docs/ARCHITECTURE.md`** | What the system is: Magnus, four pillars, connections, ownership |
| **`docs/TELEGRAM_SETUP.md`** | Setting up the bot and keeping it always on |
| **`docs/GOOGLE_CALENDAR.md`** | Calendar setup, including headless auth for the deploy |
| **`docs/YOUTUBE.md`** | YouTube / YT Music setup (search, playlists, bookmarks, cue) |
| **`docs/NOTION_SETUP.md`** | Notion OAuth redirect URI + in-chat connect flow |
| **`docs/NOTION_LIFEOS_STRUCTURE.md`** | Notion ↔ Supabase list/log map, gaps, ideal registry layout |
| **`docs/TODO_LIST_RECOMMENDATION_SCHEMAS.md`** | TODO: rich list schemas + recommend filters for all default lists |
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
| **Magnus** (`GENERAL`) | The day and week, Google Calendar, YouTube / YT Music, journaling and logging, reminders, **projects & goals**, cross-pillar questions, ordinary conversation. Operations tools; Accountability Agent vets all writes. |
| **Health** | Training, workouts, meals and macros, sleep, recovery, the health journal. Deep: sub-router, Hevy, nutrition providers, program memory, onboarding gate. |
| **Wealth** | Budgeting, spending, saving, debt, net worth, financial goals, investing philosophy. **Zerodha (Kite Connect)** read-only: holdings, Coin MF, SIPs — see `docs/ZERODHA.md`. |
| **Happiness** | Books, film, music, games, hobbies, creative practice, rest, travel, relationships. |
| **Wisdom** | Learning plans, skills and craft, career direction and growth, shipping projects. |

Wealth has **Zerodha integration** (Kite Connect OAuth, read-only portfolio context). Happiness and Wisdom use shared **operations tools** (calendar, lists, events) via `runAgentWithTools`; pillar depth remains Health-first.

---

## Quick facts

| Item | Detail |
|------|--------|
| **Runtime** | Node.js ≥ 20, TypeScript ESM, `tsx` for dev |
| **Entry** | `src/index.ts` |
| **Interface** | Telegram (Telegraf) — long polling or webhook |
| **Health HTTP** | Express on `HEALTH_PORT`/`PORT`: `GET /health`, `GET /ready`, `GET /oauth/google`, `GET /oauth/notion`, `GET /oauth/kite`, `GET /oauth/google/callback`, `GET /oauth/notion/callback`, `GET /oauth/kite/callback`, legacy `/oauth/youtube/*`, `POST /internal/jobs/morning-brief` |
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
`MAGNUS_AUTO_ALLOWLIST_NEW_USERS=false` by default — new Telegram users get a refusal until
provisioned (`scripts/provision-owner-user.mts` or `allowlisted=true` in Supabase).

`npm test` needs the dummy Supabase/Anthropic/Redis values from `.github/workflows/ci.yml` in your
shell or `.env`.

---

## Source layout

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | Boot: clients → capability log → Telegram runtime → health server → watchdog → graceful shutdown |
| `src/magnus.ts` | Turn handler: allowlist gate, chat persistence, typing indicator, orchestrator call. Starts the Morning Brief cron. |
| `src/agents/magnusOrchestrator.ts` | Classify → memory → parse/execute/compose per pillar; GENERAL uses parser plan (incl. day_overview, pillar_consultation); `finalizeMagnusVoice` at exit |
| `src/agents/orchestratorIntent.ts` | Five-way classifier with structural **routing hints** (`intentRoutingHints.ts`); only hard override: explicit meal log → HEALTH |
| `src/agents/routing/intentRoutingHints.ts` | Structural signals for top-level intent classifier (YouTube, Magnus tools, portfolio/Hevy reads) |
| `src/agents/routing/pillarConsultationSignals.ts` | Pillar read signals for `pillar_consultation` GENERAL step |
| `src/agents/routing/agentConsultation.ts` | Reconciler for `pillar_consultation` multi-pillar step |
| `src/projects/` | Projects layer: store, setup FSM, themes, executor, conflict service |
| `src/agents/tools/runAgentWithTools.ts` | Pillar agents with shared operations tools |
| `src/agents/routing/accountabilityAgent.ts` | Terminal vet + action ledger + Magnus voice |
| `src/agents/routing/pillarStrategy/` | Capability catalogs → Haiku plan parser → step executors → composer (`composePillarPlanReply`) |
| `src/agents/routing/pillarStrategy/dayOverview.ts` | Holistic day snapshot: calendar + commitments + meals |
| `src/agents/magnusAgent.ts` | Magnus himself: calendar, YouTube, event log, journaling, reminders — tool loop (optional capability-filtered tools on GENERAL) |
| `src/agents/tools/calendarTool.ts` | Google Calendar; per-user tokens; delete/update sync linked `magnus_events` rows |
| `src/agents/tools/youtubeConnectTool.ts` | In-chat `connect_google` / aliases — Calendar + YouTube one consent |
| `src/agents/tools/youtubeTool.ts` | YouTube / YT Music: search, recommend, playlists, bookmarks, cue (per-user token) |
| `src/agents/tools/eventLogTool.ts` | Event log tools: plan, update, reschedule, list (`magnus_events`) |
| `src/integrations/notion/notionProvision.ts` | Post-OAuth: create Magnus hub, Journal, standard list databases in Notion |
| `src/agents/tools/notionConnectTool.ts` | `connect_notion`, `setup_notion` Magnus tools |
| `src/lifeos/` | LifeOS Postgres writers: goals, pillar status, joy tank |
| `src/agents/tools/magnusActionDetect.ts` | Detect list, LifeOS, Notion, and event-log phrases that need Magnus tools (GENERAL) |
| `src/agents/routing/actionIntegrity.ts` | Blocks false save/add/log claims unless tools actually succeeded |
| `src/agents/tools/listTool.ts` | List catalog + `recommend_list_items` filters |
| `src/lists/` | List catalog templates, Supabase store, service orchestration, optional Notion mirror |
| `src/agents/tools/logNoteTool.ts` | Journal note → `magnus_daily_logs`, mirrored to Notion when configured; can link to an event |
| `src/lists/listService.ts` | List catalog + `log_daily_checkin` / `get_daily_checkin` writers (checkins list + LifeOS dual-write) |
| `src/users/` | Per-user program memory (`user_program_memory`) and integrations (`user_integrations`) |
| `src/events/` | Event log domain: timezone helpers, Supabase store, calendar sync, formatting |
| `src/youtube/` | Bookmarks, cue queue, and Magnus playlist state in Supabase |
| `src/agents/registry.ts` | The four pillar agents; first match on intent wins |
| `src/agents/pillarSpecialist.ts` | Shared runner for Wealth, Happiness, Wisdom |
| `src/agents/health/healthRouter.ts` | Health composite: meal log/photo deterministic gates → pillar plan parser → capability executors (compose pipeline) |
| `src/agents/health/healthOnboarding.ts` | Four-question gate on `user_health_profile` |
| `src/agents/memory/` | `loadMemoryContext`, `userKnowledge` layer, `formatMemoryBlockForSystem`, `augmentUserWithMemory` |
| `src/agents/routing/intentToPillarRoute.ts` | Intent → pillar label for metadata |
| `src/meals/` | Meal parsing, estimate chain (web search → USDA → CalorieNinjas → optional LLM), `meal_logs` writes |
| `src/nutrition/` | Local-date helpers, rollups/plan stores, **planning journey** (`meal_plan_sessions`), anomaly detection, weekly review, journal context |
| `src/pillars/health/workouts/` | Hevy client, fitness agent, Hevy write agent |
| `src/pillars/health/references/` | Reads committed program memory + Telegram journals |
| `src/jobs/` | Morning Brief: prompt, context, cron (legacy re-export), timezone window. Optional. |
| `src/events/gymHevyMatch.ts` | Match planned gym events to Hevy workouts (session label, local date) |
| `src/events/gymHevyReconcile.ts` | After grace window: sync event log from Hevy or nudge user |
| `src/proactive/` | Magnus-initiated Telegram: outbound HTML, dedupe, kind registry, dispatcher, subscriptions |
| `src/proactive/jobs/gymHevyReconcileJob.ts` | Cron: gym ↔ Hevy reconciliation for connected users |
| `src/proactive/jobs/nutritionNightlyJob.ts` | Cron: EOD rollup recompute, anomaly flags, program-memory sync |
| `src/tools/telegram.ts` | Telegraf bot, `/start` and `/help`, rate limit, update dedupe, webhook mount |
| `src/tools/telegramWatchdog.ts` | Liveness probe; exits so the host restarts |
| `src/config/telegramRuntime.ts` | Polling vs webhook, public URL derivation, handler timeout |
| `src/config/telegramCommands.ts` | The two registered commands (import-free, so the CLI needs no credentials) |
| `src/config/magnusCapabilities.ts` | Env → capability report for `telegram:check` and the boot log |
| `src/healthServer.ts` | `/health`, `/ready`, Morning Brief job route, Telegram webhook, unified Google OAuth (`GET /oauth/google/callback`) |
| `src/integrations/googleCalendar/` | OAuth (env refresh token or local token file) + Calendar operations |
| `src/integrations/youtube/` | YouTube Data API operations + auth helpers |
| `src/integrations/google/` | Unified in-chat OAuth (Calendar + YouTube scopes, dual-write tokens) |
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
   The classifier receives **routing hints** (explicit meal log, YouTube/Magnus-tool signals,
   portfolio/Hevy read signals) with the message; only explicit meal-log command format hard-overrides
   to `HEALTH`. On `GENERAL`, the pillar plan parser may choose `pillar_consultation` (Magnus tools +
   pillar depth in one reply) or `day_overview` (calendar + commitments + meals). Pillar specialists
   are prompt-only except Health (capability executors) and Wealth (Kite read in executor).
6. **Memory** — Loaded once per turn: recent chat, rolling summary, semantic facts, structured profile/goals/logs, **active projects block** in user knowledge. **Accountability Agent** at orchestrator exit: `action_ledger` + `accountability` metadata on tool turns. Tunable via `MAGNUS_MEMORY_*`.
7. **Persistence** — `magnus_chat_messages` gets a user row and an assistant row per turn, with
   routing in `metadata` (`delegated_agent`, `agent_metadata`). Columns `message_type`
   (`conversation` | `automated`) and `delivery_trigger` (`manual`, `scheduled`, `http`,
   `event_reminder`, `system`, …) classify normal chat vs Magnus-initiated outbound and why it
   was sent. **Project setup:** active `project_sessions` row → deterministic `project_setup` routing (incl. "lock it in"); action integrity treats draft session saves as valid — no false "haven't saved" on review turns.
8. **Replies** — One reply per turn, chunked only for Telegram's size limit, sent as HTML.
9. **Proactive Telegram** — Magnus can initiate messages without a user turn: in-process cron
   (`MAGNUS_PROACTIVE_CRON_ENABLED`, default on) runs scheduled jobs every
   `MAGNUS_PROACTIVE_CRON_INTERVAL_MINUTES` (default 5). Jobs: **morning brief** (local hour from
   `MAGNUS_MORNING_BRIEF_LOCAL_HOUR` in `user_profile.timezone`; Redis dedupe per calendar day),
   **event reminders** (`remind_at` on `magnus_events`, sets `reminded_at` after send), **gym ↔ Hevy
   reconcile** (3 hours after planned gym time: if Hevy has a session that day, mark the event log
   `done` with Hevy start/end and tell the user; otherwise ask once if they missed it / want to
   postpone), **nutrition nightly** (~23:00 local: recompute rollups, anomaly flags, sync persistent
   lapse patterns to `program_learnings`; `MAGNUS_NUTRITION_NIGHTLY_ENABLED`), **subscription dispatcher** (`evening_journal`, `drift_guard`, `midday_encouragement`, `stale_list_nudge`,
   `chat_inactivity`, `custom_reminder`, `meal_log_reminder`, `meal_adherence_nudge`, `meal_eod_reconciliation`, `meal_gap_nudge`, `weekly_nutrition_review` via `magnus_proactive_subscriptions` — modular kind registry in
   `src/proactive/kinds/`). User controls via `manage_proactive_messages` tool: list/enable/disable/disable_all
   catalog kinds, create one-shot or daily custom reminders (`create_reminder` /
   `create_recurring_reminder`). Relative time parsing for one-shots (`tomorrow 8pm`, `in 30 minutes`).
   LLM gate+compose (Haiku) for evening journal, drift guard, midday encouragement, stale list nudges,
   and chat inactivity; quiet hours 23:00–06:00 local; adaptive cap 3/day (scheduled + user-asked
   reminders exempt). Manual brief: say `morning brief` or
   `/morningbrief`. Outbound uses HTML formatting and is logged to `magnus_chat_messages` with
   `metadata.proactive`.
10. **Event log** — Magnus tools `log_event`, `update_event`, `reschedule_event`, `list_events` write
   to `magnus_events`. Moving a commitment closes the old row and opens a linked replacement (never
   edits time in place). A second `log_event` for the same activity with a different time within two
   hours is rejected — Magnus must call `reschedule_event` instead. Calendar delete/update cancels or
   reschedules the linked event-log row automatically. Memory and the Morning Brief read commitments
   around today plus per-activity adherence from `magnus_event_activity_stats`.
11. **Google (Calendar + YouTube)** — Per-user tokens in `user_integrations`. In chat: “connect
    Google” → one consent; `GET /oauth/google/callback` stores the same refresh token on
    `google_calendar_refresh_token` and `google_youtube_refresh_token`. Host needs a **Web**
    OAuth client (`GOOGLE_CLIENT_ID` / `SECRET`). YouTube playlists resolve by pillar name
    (`wisdom`, `wealth`, `magnus`, …) or `PL…` id; aliases cached in `magnus_youtube_state.playlist_aliases`.
    Bulk actions: `clear` (empty playlist), `dedupe` (remove duplicate videos).
12. **Intent routing** — Only Magnus (`GENERAL`) has tools. YouTube actions, list/LifeOS/Notion
    phrases, and short continuations after a Magnus tool turn coerce to `GENERAL`. Pillar specialists
    are prompt-only and must not claim tool actions (see `pillarSpecialist.ts` guard). Health has
    sub-router depth; Wealth loads Kite read-only portfolio context. **Photo turns:** `src/vision/`
    analyzes caption + recent chat, infers purpose (`meal_log`, `list_items`, …) and routes to the
    correct pillar; `meal_log_photo` only when purpose is food. Short meal-slot follow-ups (`Dinner?`)
    after meal context route to HEALTH `meal_plan_read`.
13. **Gym schedule** — Fitness turns inject today's session from locked `weekly_schedule` program memory
    (Mon-first table) before Hevy history.
14. **Pillar execution plans** — Every routed pillar runs a Haiku **plan parser**
    (`MAGNUS_PILLAR_STRATEGY_MODEL`, default `claude-haiku-4-5`) that sees the user message,
    **routing hints** (meal session flags, integration connectivity, recent turn previews), and returns
    an ordered **steps[]** array (1–`MAGNUS_PILLAR_PLAN_MAX_STEPS`, default 4). **Architecture:
    input parse → execute → output parse (compose)** — one Magnus voice at terminal exit. **Step executors**
    run sequentially with full context and prior-step outcomes; GENERAL steps use Magnus with
    capability-filtered tools or `day_overview` / `pillar_consultation`. A **composer**
    (`MAGNUS_PILLAR_PLAN_COMPOSE`, default on) re-voices every step output (single- and multi-step).
    `finalizeMagnusVoice` at the orchestrator boundary catches any path that did not already compose.
    Terminal confirmations (e.g. cancel planning, OAuth links) set `pillar_compose: false`. Deterministic
    pre-gates stay before the parser where unambiguous (explicit meal log, **food** meal photo) — then through
    compose like other capabilities. **Photo attachments:** every Telegram photo runs context-aware vision
    (`src/vision/`) using caption + recent turns — infers purpose (meal_log, list_items, receipt, …) and
    routes to the right pillar (not blindly HEALTH). Vision summary is appended to the user message for
    parsers and agents; meal_log_photo only when purpose is food. Meal-plan create vs read is parser-owned. **day_overview** (GENERAL)
    loads calendar + event log + planned meals. Review-step meal Q&A answers without re-posting the draft.
    Happiness/Wisdom catalogs include multiple capabilities (recommendations, travel, learning plan, etc.).

---

## Database

**Written:** `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `magnus_events`, `meal_logs`, `meal_daily_rollups`, `meal_plan_entries`, `meal_plan_sessions`, `meal_plan_templates`,
`user_health_profile`, `user_program_memory`, `user_integrations`, `memory_summaries`, `projects`, `features`, `project_sessions`,
`user_health_profile`, `user_program_memory`, `user_integrations`, `memory_summaries` (Phases 2–3:
rolling summary + semantic facts), `magnus_youtube_bookmarks`, `magnus_youtube_cues`,
`magnus_youtube_state` (includes `playlist_aliases` JSONB for pillar playlist ids).

**Read only:** `workouts`, `goals`, `daily_scores`, `happiness_reserve`,
`patterns`, `life_patterns`, `pillar_status`, `kpi_readings`, `magnus_insights`, `daily_plans`,
`magnus_events_open`, `magnus_event_activity_stats`.

Public tables use RLS with a `service_role_only` policy; the service role key bypasses it. The new
Supabase `sb_secret_…` key format works as service role.

`supabase/migrations/` covers `magnus_daily_logs`, `user_health_profile`, `meal_logs`, `meal_daily_rollups`, `meal_plan_entries`, `meal_plan_sessions`,
`projects`, `features`, `project_sessions`, `magnus_events`, `magnus_proactive_subscriptions`, `memory_summaries`, `magnus_youtube_*` (incl. `playlist_aliases`), and `magnus_chat_messages` type columns;
older schema was applied directly to the project before those migrations existed.

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
- **`MAGNUS_PROACTIVE_CRON_ENABLED`** — scheduled Magnus-initiated Telegram (default on). Set
  `MAGNUS_MORNING_BRIEF_CRON_ENABLED=false` to skip only the brief job.
- **`MAGNUS_PILLAR_STRATEGY_MODEL`** — Plan parser model (default `claude-haiku-4-5`).
- **`MAGNUS_PILLAR_PLAN_MAX_STEPS`** — Max steps per plan (default `4`, max `8`).
- **`MAGNUS_PILLAR_PLAN_COMPOSE`** — Haiku composer for pillar step replies (default on; single- and multi-step).
- **`MAGNUS_PILLAR_COMPOSE_MODEL`** — Composer model (default `claude-haiku-4-5`).
- **`MAGNUS_MAX_TOOL_ROUNDS`** — Magnus agent tool loop cap (default 12).
- **`MAGNUS_TURN_TIMEOUT_MS`** — Orchestrator turn budget before user-facing timeout reply (default 240000).

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
| `npx tsx scripts/dev/validate-user-query-catalog.mts` | Validate 157 user-query routing hints against detectors |
| `npx tsx scripts/provision-owner-user.mts` | Wipe + recreate owner `user_profile`, seed program memory and integrations |
| `npx tsx scripts/upsert-user-integrations.mts` | Update `user_integrations` for a user without wiping data |
| `npx tsx scripts/reset-user-notion-lists.mts` | Reset list architecture + re-sync notion_registry for a user |
| `npx tsx scripts/audit-notion-lifeos.mts` | Inventory LifeOS hub + accessible Notion databases |
| `npx tsx scripts/nutrition/rebuild-rollups.mts` | Rebuild `meal_daily_rollups` from `meal_logs` |

**Meal planning journey:** User says "plan my meals for the week" → … Locked plan edits via parser → **meal_plan_skip** / **meal_plan_swap** (replace one dish with `new_title`, or exchange two slots with `slot` + `exchange_with_slot`). **Photo logging:** …

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

- **Memory reads LifeOS tables only when enabled** — `MAGNUS_LIFEOS_CONTEXT_ENABLED=false` (default).
  Magnus tools write LifeOS: `add_goal` (dual-write), `update_pillar_status`, `log_joy_tank`, `list_lifeos_goals`.
  Set `MAGNUS_LIFEOS_CONTEXT_ENABLED=true` when tables have data.
- **List recommendation schemas** — `recommend_list_items` filters `extra` JSONB today; richer
  per-archetype columns and Notion mirror fields remain planned. See
  **`docs/TODO_LIST_RECOMMENDATION_SCHEMAS.md`**.
- **Schema not reproducible** from `supabase/migrations/` for tables predating April 2026 migrations.
  Baseline migrations for `user_profile` and `magnus_chat_messages` added 2026-08-04; LifeOS tables
  remain in `scripts/magnus_db_hardening.sql` (see `supabase/README.md`).
- **Semantic recall** — no embeddings; memory is recent-window plus structured reads.
- **Wealth, Happiness, Wisdom are shallow** — one prompt each, no tools or data (Wealth has read-only Zerodha context today; see below).
- **Kite write (long-term)** — equity order placement/cancel via Kite Connect, behind `MAGNUS_KITE_ORDERS_ENABLED`, static IP on the developer console, and a Telegram **CONFIRM** flow separate from wealth coaching. Probe script: `npm run kite:test-write` (`scripts/wealth/kite/test-write-endpoints.mts`). **Live probe (2026-08-03):** Coin MF writes (`POST/DELETE /mf/orders`, `/mf/sips`) return **403 Insufficient permission** — not available on this app/plan; equity `POST /orders/regular` blocked until **static IP** is configured; equity cancel auth works (404 on fake id). Do not build MF execution in Magnus unless Zerodha opens those APIs.
- **Morning Brief does not read Google Calendar** — it reads the event log and LifeOS tables; empty
  LifeOS sections are omitted when `dataAvailability` flags are false (no “unknown” filler).
- **Activity/inactivity proactive** — `stale_list_nudge` (queued joy/media items idle 14+ days) and
  `chat_inactivity` (no Telegram messages for 3+ days) are opt-in catalog kinds with LLM gate+compose.
- **No E2E tests** against live Telegram, Supabase, Hevy, Google Calendar or YouTube (turn-handler smoke in `src/magnus.smoke.test.ts` only).
- **Notion list mirror** — Supabase canonical; OAuth reconnect now wipes legacy LifeOS hub/registry and provisions a fresh **Magnus** page (no discover fallback to old DBs). Say connect Notion again after deploy if relink stuck on old LifeOS.
**Hevy in Telegram:** Fitness turns inject the last 5 Hevy list rows with **full per-set detail** (weight×reps or duration) via `formatHevyWorkoutsForPrompt` — not headline-only summaries.

---

**Last updated:** 2026-08-10 (project setup routing + draft action integrity)
