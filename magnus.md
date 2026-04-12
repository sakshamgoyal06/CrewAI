# Magnus — project tracker

**This file (`magnus.md` at the repository root) is the single source of truth** for what the codebase does, what was integrated with Supabase, and how to run and extend the project. Update it when you ship meaningful changes.

For **philosophy, product intent, and target architecture** (LifeOS ↔ Magnus), see **`MAGNUS_CORE_CONTEXT.md`**.

For **agent roster, prompts, scope, and bot actions** (review hub), see **`docs/AGENT_ROSTER.md`**.

For **pillar → department → specialist** target routing (Health, Wealth, Wisdom, Joy), see **`docs/AGENT_ARCHITECTURE.md`**.

For **Cursor-ready prompts** to implement new agents and routing (copy-paste blocks), see **`docs/CURSOR_AGENT_PROMPTS.md`**.

---

## Daily agent hardening (rolling)

**Plan:** Tackle **one specialist per day** until the roster feels production-grade: prompts, tool boundaries, error handling, tests, and real Telegram UX (no duplicate boilerplate, no wrong routing, no repeated bad answers).

| Day (first focus) | Agent | Code |
|-------------------|--------|------|
| **2026-04-13** | **Culture** (books / film / poetry) | `src/agents/joy/cultureRecommenderAgent.ts` |

**Next days:** Continue down Joy → Health → Wealth → Wisdom → Intelligence as needed; update this table when the order changes.

**Culture — known gaps from live chat (2026-04-12):** Recommending the **same titles** across follow-up asks for “fresh” lists; **platform/region availability** stated confidently without live catalog tools. Tomorrow’s pass should tighten anti-repetition instructions, humility on streaming availability, and optional regression tests on the system prompt.

---

## Current status (2026-04-12)

**Verdict:** The **base is ready** for **agent hardening** and **domain-table writes**, as long as you complete the **owner checklist** below. The stack is **production-oriented** (structured logging, health checks, timeouts, RLS policies, rate limits, CI build+test). **Full product QA** (E2E, load, staging deploy) remains ahead.

**Latest build (what shipped recently):**

- **Routing & orchestrator** — Slash commands (`src/agents/routing/slashCommands.ts`), pillar routing (`intentToPillarRoute`, `resolvePillarRoute`), natural-language intent in `orchestratorIntent.ts`, `magnusOrchestrator` cycle (slash vs classify → memory → dispatch). Wealth composite + Joy agents registered; specialist prompts include **`SPECIALIST_USER_IDENTITY`** (`promptIdentity.ts`) so models do not address the user as “Magnus”.
- **Telegram** — `setMyCommands` via **`getTelegramBotCommandsForRegistration()`**; default **`MAGNUS_TELEGRAM_COMMANDS_MODE`** is **minimal** (`/menu` + `/meal`) so the native menu does not auto-send dozens of empty `/commands`. **`/menu`** sends an **inline keyboard**; picks set **pending slash** in Redis and merge the **next plain-text message** into `/<cmd> <text>` (`pendingSlashSelection.ts`). **`MAGNUS_TELEGRAM_COMMANDS_MODE=full`** restores the long command list.
- **Meal logging pipeline** — Session-based `meal_logs` with multi-component rows, per-day rollups, optional daily macro targets (`mealLogPipeline`, `recordMealLog`, `mealDaySummary`, `formatMealLogReply`). CalorieNinjas/USDA scaling and picks (`calorieNinjasScale`, `calorieNinjaPick`), optional web-research estimate path, consolidated Telegram replies.
- **Health / Nutrition** — `nutritionOrchestrated` coordinates parsing (`mealParserAgent`, `jsonExtract`), API estimates, and meal-log completion; `healthRouter` and nutrition stack aligned with the new meal path; additional Health specialists (meal planner, alternates, long-term planning, workouts coach) where wired.
- **Orchestrator & Telegram** — Chunking/formatting (`telegramFormat`), delegation notice (`delegationNotice.ts`).
- **Morning Brief** — Prompt includes specialist identity line (`morningBriefPrompt.ts`).
- **Supabase migrations** — `20260412190000_meal_logs_align_magnus.sql`, `20260412210000_meal_session_and_daily_targets.sql`, `20260412220000_meal_logs_estimate_source_web_research.sql` (apply in Dashboard or `supabase db push` if not already).
- **Tests** — Broadened coverage for meals, health JSON extract, orchestrator paths, slash commands, pending merge; `npm run build` + `npm test` green.

**Database:** On **2026-04-12**, all **`public`** tables on project `xdrpjfdhduskhzryevze` were **`TRUNCATE … RESTART IDENTITY CASCADE`** (profiles, chat history, meal logs, and domain tables are **empty**). New Telegram users get fresh `user_profile` rows as they chat; re-seed anything you need for demos.

| Area | State |
|------|--------|
| **Runtime** | Telegram bot + health HTTP + typed TS + `npm run build` / `npm test` / CI workflow |
| **Database** | Schema + FKs to `user_profile`, RLS + `service_role_only` on public tables; **currently empty** after truncate — **seed or create rows** as you build features |
| **App ↔ DB** | **Wired today:** `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `meal_logs` (+ related meal migrations), `user_health_profile`. **Lightly / not wired in app logic yet:** most other domain tables (goals, KPIs, tasks, …) — **next phase** |
| **Agents** | `src/agents/` — orchestrator registry, **Notion**, Health composite, **Planner**, **Learning** (tracker / plan), **Build & Ship**, **Research** (GENERAL research sub-route only); **Memory** (semantic recall **stub**); see **Agents** below |

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

1. **Refine and complete each agent** — Follow the **Daily agent hardening** table above (Culture first on **2026-04-13**). Bring every specialist to **production quality**: clear prompts, tool boundaries, error handling, tests, and observability. Broader backlog: **Notion** (env + DB writes), **Health stack** (onboarding slot accuracy, gates vs slash intent), **Planner**, **Research**, **Memory** (replace `semanticRecall` stub with real embeddings when ready). Close gaps called out in `memory` context (`gaps`) rather than silent failures.

2. **Subagents and routing** — Keep new specialists behind `src/agents/`, register in `registry.ts`, and extend `handleMessage` / `createMagnus().start()` only when interfaces are stable.

3. **Database usable, then hosted bot** — **Prove the database end-to-end**: inserts/updates with `user_profile_id`, domain tables you care about, `npm run test:supabase`, and seeds/smokes. Then **deploy** (Docker, Railway, Fly.io, VPS, …) so the bot runs **continuously**. Use **`NODE_ENV=production`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`/health` / `/ready`**, and **one** long-poller per bot token.

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
| **Health HTTP** | Express on `HEALTH_PORT` (default **8080**): `GET /health` (liveness), `GET /ready` (Supabase + Redis), `POST /internal/jobs/morning-brief` (auth via `MAGNUS_INTERNAL_JOB_SECRET`) |
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
| HTTP | `express` | **Health server** (`/health`, `/ready`) + **internal job** route for Morning Brief (`POST /internal/jobs/morning-brief`); not a general public API |
| Jobs | `node-cron` | In-process **Morning Brief** scheduler (optional; see env); users filtered by `user_profile.timezone` |
| Notion | `@notionhq/client` | **Server-side** API for the Notion agent and tools (`src/tools/notion.ts`); headless bot does not use Cursor MCP. Same `NOTION_TOKEN` as Morning Brief when both are enabled. |

---

## Source layout

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | `dotenv` → `logger` → `clients` → `startHealthServer()` → `startBot` → `handleMessage` → one or more `reply()` calls per turn (delegation notice + specialist when enabled). |
| `src/healthServer.ts` | Express: `/health`, `/ready` (Redis `PING` + Supabase `user_profile` head query); `POST /internal/jobs/morning-brief` (Bearer / `X-Magnus-Job-Secret`). |
| `src/jobs/morningBrief.ts` | Morning Brief ritual: Claude `MORNING_BRIEF_SYSTEM`, context from Supabase, optional Telegram + Notion. |
| `src/jobs/morningBriefCron.ts` | `node-cron` every 15 min (UTC tick); per-user local hour/window + Redis dedupe. |
| `src/jobs/morningBriefManual.ts` | Manual trigger helper (used by Telegram). |
| `src/tools/notionMorningBrief.ts` | Optional Notion child page under `NOTION_MORNING_BRIEF_PARENT_PAGE_ID`. |
| `src/logger.ts` | `pino` instance + `maskTelegramUserId`. |
| `src/intent.ts` | `parseIntent` / `INTENTS` (pure; used by `magnus` + tests). |
| `src/magnus.ts` | `createMagnus().start()` schedules Morning Brief cron; `handleMessage`: resolve profile → allowlist/tier gates → **meal log commands** (`/meal`, `meal:`, `log meal:`) → `runOrchestratorReply` → optional delegation notice → persist chat rows. |
| `src/meals/` | `parseMealLogCommand` / `isMealCommand`, `estimateMealNutrition` (CalorieNinjas → USDA FDC → optional proxy → optional LLM), `recordMealLog` → `meal_logs`. |
| `src/config/projectSettings.ts` | Env-backed toggles (e.g. `MAGNUS_DELEGATION_NOTICE`). |
| `src/magnus/delegationNotice.ts` | User-facing copy when a specialist takes the turn. |
| `src/agents/` | Types, `dispatchToAgent`, **Notion** (`knowledge/notionAgent.ts`), Health composite, Planner, **Research** (`intelligence/researchAgent.ts`), `runOrchestratorReply` (see **Agents** below). |
| `src/tools/notion.ts` | Notion API client (`NOTION_TOKEN`), retry/backoff, `ensurePageForDate`, `appendParagraphBlocks`, `queryDatabaseByDateProperty`, `createGoalPage` — IDs from env (Goals, Daily Check-ins, Patterns, daily log parent). |
| `src/tools/dailyLog.ts` | `recordMagnusDailyLog` → `magnus_daily_logs` (mirrors Notion agent writes for memory + briefs). |
| `src/tools/research/` | `gatherResearchMaterials`, `fetchPageExcerpt`, optional SerpAPI `searchWebAndFetch` — HTML sanitisation, timeouts, response size caps. |
| `src/tools/clients.ts` | Singletons: `supabase` (timeouts + `auth` for server), `redis`, `anthropic` (timeout + retries). Production requires service role key. |
| `src/tools/rateLimit.ts` | Redis fixed-window counter (60s) for inbound Telegram text (`checkMessageRateLimit`). |
| `src/tools/chatLog.ts` | `resolveTelegramUserProfile`, `recordMagnusChatMessage` (returns `{ ok }`), legacy `ensureUserProfileIdForTelegramUser`. Documents identity model in file header. |
| `src/tools/telegram.ts` | Telegraf bot; `/morningbrief` + `morning brief` → Morning Brief; rate limit before handler; `TelegramTextHandler` receives `updateId` for logging. |
| `scripts/test-supabase.mts` | Connectivity smoke test for Supabase + chat table. |

### Agents (orchestration)

| File | Role |
|------|------|
| `src/agents/types.ts` | `AgentContext`, `AgentResult`, `DepartmentAgent` |
| `src/agents/registry.ts` | `dispatchToAgent` — **priority order**: `Notion` → `HealthComposite` → `Planner` → `LearningTracker` / `LearningPlan` → `BuildShip` |
| `src/agents/magnusOrchestrator.ts` | Keyword override → **NOTION** (`isNotionIntentOverride`); classify intent; memory context; **GENERAL** research sub-route (`isResearchSubIntent`); `answerGeneral`; delegate specialists; `routingPlaceholder` |
| `src/agents/intelligence/researchAgent.ts` | `RESEARCH_SYSTEM`, `runResearchAgent` — structured Markdown (Executive answer, Key points, Sources, Open questions); uses gathered URLs / search / pasted text |
| `src/agents/health/healthRouter.ts` | `healthCompositeAgent` (`HEALTH`): sequential first-accept Fitness → Nutrition → Energy, then generic ack |
| `src/agents/health/fitnessAgent.ts` | `FITNESS_SYSTEM`, `tryFitnessAgent`, optional `workouts` context; metadata `agent: "fitness"` |
| `src/agents/health/healthSubIntent.ts` | `hasFitnessKeyword`, `classifyHealthSubIntent` (same model as orchestrator; `max_tokens: 64`; no new env vars) |
| `src/agents/health/healthOnboarding.ts` | `fetchUserHealthProfile`, `startHealthOnboarding`, `runHealthOnboardingTurn`, `formatHealthPreferencesForPrompt` — gates Health until `user_health_profile.onboarding_completed_at` is set |
| `src/agents/planning/plannerAgent.ts` | `PLANNER_SYSTEM`, `runPlannerAgent` — text planning coach for `PLANNING` (locked day, optional profile north star / timezone) |
| `src/agents/knowledge/notionAgent.ts` | `NOTION` — append dated log under parent page, query today’s check-in DB, create Goals row; requires env (see `.env.example`) |
| `src/agents/memory/` | `loadMemoryContext`, `formatMemoryBlockForSystem`, `augmentUserWithMemory`, `intentToMemoryPurpose`, `semanticRecall` (pgvector **stub**; logs at debug) |
| `src/agents/index.ts` | Barrel re-exports (includes memory API) |

**Health onboarding:** Apply migration `supabase/migrations/20260412140000_user_health_profile.sql` so `user_health_profile` exists. If a row exists and `onboarding_completed_at` is null, **every** message is handled by Health onboarding (no intent classification) until the user finishes the four questions or types `skip`. The first time the classifier returns **HEALTH** and there is no row, Magnus inserts the profile and sends the intro. No new environment variables.

**Routing model:** Free text goes **Magnus → classify → `resolvePillarRoute` on `AgentContext` → memory (when applicable) → `dispatchToAgent`**. **Telegram `/commands`** (see `src/agents/routing/slashCommands.ts` — also **setMyCommands** on bot launch) **skip classification**, set **intent + `DepartmentId`**, and pass **body-after-command** (or a default prompt) to the department agent; **`/research`** forces the Research path. **Wealth** uses **`wealthCompositeAgent`** (`src/agents/wealth/wealthRouter.ts`) to pick Trading / Investment / … from `ctx.department`. **Health** still uses **`healthCompositeAgent`** (meal → planner → … → fitness → nutrition → energy). **Joy** specialists are registered again (`RELATIONSHIPS`, `HAPPINESS`, `CULTURE`). For natural-language turns, **Notion** / **meal:** coercions apply when the classifier returns `GENERAL`. Then: same registry order as code. Plain `GENERAL` (non-research) uses the short Claude reply.

**Slash aliases:** `/relationship` is an alias of `/relationships` (same intent, department, and default prompt; see `COMMAND_ALIASES` in `slashCommands.ts`).

**Memory context (orchestrator):** Each turn calls `loadMemoryContext({ userProfileId, telegramUserId, purpose })` (`purpose` from `intentToMemoryPurpose`). A compact string from `formatMemoryBlockForSystem` is appended to the user message for **GENERAL** / **Research** (`augmentUserWithMemory`) and passed as **`memoryBlock`** on `AgentContext` for specialists (Health stack, Planner). Missing optional tables surface as **`gaps`** inside that block — not silent failure. Structured logs at **debug** (`memoryAgent`, `magnusOrchestrator`): purpose, gap count, turn counts, shortened profile id — **not** raw message bodies. A separate `get_memory` tool is **not** implemented; memory is always loaded once per turn for the orchestrator path.

### Meal logging (Telegram)

**`/meal` only** skips intent classification (direct invoke). **`meal:`** / **`log meal:`** go through **`runOrchestratorReply`** (classify → if `GENERAL`, coerce to `HEALTH` so the meal pipeline still runs). All paths still use the Health composite / meal orchestration inside the orchestrator (not a separate `handleMessage` bypass).

**Practical APIs (default):** Order is **CalorieNinjas → USDA FDC** — HTTP-only, no LLM tokens. Set **`CALORIENINJAS_API_KEY`** and/or **`USDA_FDC_API_KEY`** in `.env`.

**Optional fallbacks:** If **`HEALTHIFYME_PROXY_URL`** is set, Magnus tries your bridge **after** both APIs fail (see `src/meals/providers/healthifyMeProxy.ts`). There is **no official HealthifyMe public API**; the proxy is your own service.

**LLM estimate:** Only if **`MAGNUS_MEAL_LOG_LLM_FALLBACK=true`** — uses Claude JSON when APIs (and optional proxy) all fail; otherwise the row is still logged with `estimate_source: unavailable` and the reply explains missing keys.

**Commands:** `/meal …`, `meal: …`, `log meal: …`. Rows go to **`meal_logs`** with **session grouping** and **component lines** once migrations through **`20260412210000_meal_session_and_daily_targets.sql`** are applied; align columns with **`20260412190000_meal_logs_align_magnus.sql`**; optional **`estimate_source`** / web research via **`20260412220000_meal_logs_estimate_source_web_research.sql`**.

---

## Runtime behaviour (summary)

1. **Identity** — Each Telegram **user** is keyed by `ctx.from.id` (string). Profiles are stored in `user_profile.telegram_chat_id` (same string; column name is legacy).
2. **Profile resolution** — `resolveTelegramUserProfile`: find by `telegram_chat_id`; else adopt a single orphan row with null Telegram id; else insert defaults + access fields.
3. **Access (dummy)** — `allowlisted`, `user_tier`, `access_flags` on `user_profile`. Env: **`MAGNUS_AUTO_ALLOWLIST_NEW_USERS`** must be **`true`** for new profiles to get `allowlisted: true` (default **false** for safer production), `MAGNUS_DEFAULT_USER_TIER` (`standard` \| `premium` \| `internal`). If not allowlisted or `access_flags.chat === false`, return a fixed refusal string (no user/assistant chat rows for the blocked path).
4. **Rate limit** — Inbound text messages: Redis-backed fixed 60s window per Telegram user (`MAGNUS_RATE_LIMIT_PER_MINUTE`, default 30/min; `0` disables).
5. **Intent classification** — Categories include `NOTION`, `HEALTH`, … `/meal` forces `HEALTH` without classify. Otherwise classify → pillar/department on context → delegate when a specialist is registered (`NOTION` → Notion, `HEALTH` → Health composite, `PLANNING` → Planner, `LEARNING` → learning specialists, `BUILD` → Build & Ship); otherwise **routing placeholder**. `GENERAL` → **Research** (research sub-route) or short Claude reply.
6. **Chat persistence** — Table `magnus_chat_messages`: each successful turn logs **user** then **assistant** with `user_profile_id`, `telegram_user_id`, optional `intent`, `metadata` (tier, flags, `telegram_user_id`). When **`MAGNUS_DELEGATION_NOTICE`** is on and Magnus delegates to a specialist (`delegated_agent` set), an extra **assistant** row is written first for the short delegation notice (`metadata.delegation_notice: true`), then the specialist reply. Proactive `sendMessage` / `sendMarkdown` logs an extra **assistant** row with `metadata.outbound`.
7. **Telegraf** — `startBot` returns a Promise resolved in the launch callback so startup logging works without awaiting the infinite polling loop.

---

## Environment variables

See **`.env.example`** for the full list. Highlights:

- **`SUPABASE_SERVICE_ROLE_KEY`** — Use for this server. **Required when `NODE_ENV=production`.** With RLS `service_role_only` policies, anon cannot read/write data.
- **`MAGNUS_SUPABASE_DB_TIMEOUT_MS`**, **`MAGNUS_ANTHROPIC_TIMEOUT_MS`**, **`MAGNUS_ANTHROPIC_MAX_RETRIES`** — Client timeouts/retries (see `.env.example`).
- **`HEALTH_PORT`** — Port for `/health` and `/ready` (default 8080).
- **`MAGNUS_RATE_LIMIT_PER_MINUTE`** — Inbound Telegram messages per user per minute (`0` = off).
- **`MAGNUS_DELEGATION_NOTICE`** — When **`true`** (default), Telegram sends a short notice **before** the specialist reply whenever a department agent or research handles the turn; set **`false`** to reduce message volume at mass scale.
- **`MAGNUS_AUTO_ALLOWLIST_NEW_USERS`** — Must be **`true`** to seed `allowlisted: true` for **new** profiles.
- **`MAGNUS_DEFAULT_USER_TIER`** — Seeded tier for new profiles.
- **`LOG_LEVEL`** — e.g. `debug`, `info`, `warn`, `error`.
- **`CALORIENINJAS_API_KEY`**, **`USDA_FDC_API_KEY`**, **`HEALTHIFYME_PROXY_URL`** / **`HEALTHIFYME_PROXY_TOKEN`** — meal logging (see **Meal logging** above and `.env.example`).
- **`MAGNUS_SERPAPI_KEY`** or **`SERPAPI_API_KEY`** — optional; enables Google search via SerpAPI when the user asks for research but provides no URLs (see `.env.example`).
- **`MAGNUS_RESEARCH_FETCH_TIMEOUT_MS`**, **`MAGNUS_RESEARCH_MAX_RESPONSE_BYTES`** — bounds for research HTTP fetches.
- **Morning Brief** — `MAGNUS_MORNING_BRIEF_ENABLED` (default **true**; set `false` to disable generation). `MAGNUS_MORNING_BRIEF_CRON_ENABLED` (default **false**; set **true** to start in-process cron). `MAGNUS_MORNING_BRIEF_LOCAL_HOUR` (0–23, default **7**), `MAGNUS_MORNING_BRIEF_WINDOW_MINUTES` (default **14**). `MAGNUS_INTERNAL_JOB_SECRET` — required for `POST /internal/jobs/morning-brief`. `MAGNUS_MORNING_BRIEF_DEFAULT_USER_PROFILE_ID` — optional default profile for HTTP trigger when body omits `userProfileId`. **Notion (optional):** `NOTION_TOKEN`, `NOTION_MORNING_BRIEF_PARENT_PAGE_ID`, optional `NOTION_MORNING_BRIEF_TITLE_PROPERTY` (default `title`).
- **Notion agent (chat)** — same **`NOTION_TOKEN`** (or `NOTION_API_KEY`); optional **`NOTION_GOALS_DATABASE_ID`**, **`NOTION_DAILY_CHECKINS_DATABASE_ID`**, **`NOTION_PATTERNS_DATABASE_ID`**, **`NOTION_DAILY_LOG_PARENT_PAGE_ID`**, and property/title overrides — see **`.env.example`**. **`SKIP_NOTION_INTEGRATION`** — skip optional live tests in `notion.integration.test.ts`.

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

### `magnus_daily_logs` (free-form daily notes)

- **Purpose:** Durable mirror of LifeOS “log a note” behaviour — complements **Notion** (human-readable) and structured **`daily_scores`** (evening check-in sliders). Written when the **Notion** agent appends a dated page or creates a Goals row (`src/tools/dailyLog.ts`); surfaced in **memory** (`loadMemoryContext`) and **Morning Brief** context (`recentMagnusDailyLogs` in the JSON payload).
- **Columns:** `user_profile_id`, `log_date` (DATE), `body`, `source` (`telegram` \| `notion` \| `system`), optional `notion_page_id`, `metadata` (jsonb), timestamps.
- **Migration:** `supabase/migrations/20260412120000_magnus_daily_logs.sql` — apply in Supabase SQL Editor (or your migration workflow) before relying on inserts.

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

**Runtime:** `telegraf`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `@upstash/redis`, `@notionhq/client`, `dotenv`, `express`, `pino`, `node-cron`.  
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

- **Additional cron / proactive loops** beyond Morning Brief (reviews, pattern jobs, reminders).
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

**Last updated:** 2026-04-12 (Added `docs/CURSOR_AGENT_PROMPTS.md` — detailed Cursor instructions per agent batch; linked from `magnus.md`)
