# Magnus — agent roster (prompts, scope, actions)

**Purpose:** Single review surface for every bot persona: **Magnus** (orchestrator) and **pillar specialists**. Update this when prompts, scope, or tooling change.

| Doc | Role |
| --- | --- |
| This file | Who each agent is, what it may do, and the words it runs on |
| `magnus.md` | Runtime, env, DB, deployment |
| `docs/TOOLS_AND_AGENTS.md` | **Live wiring** — agents, tools, proactive jobs, integrations |
| `docs/USER_QUERY_GUIDE.md` | User asks → routing path and expected output |
| `MAGNUS_CORE_CONTEXT.md` | Philosophy and target architecture |

**Convention**

- **Implemented** — Prompt or behaviour exists in this repo (see path).
- **Model (default)** — `claude-sonnet-4-6` for orchestrator classify and pillar agents; Haiku for plan parser and compose (`MAGNUS_PILLAR_STRATEGY_MODEL`, `MAGNUS_PILLAR_COMPOSE_MODEL`).

---

## 0. Core vs personalised context (multi-user)

Magnus is built for **many Telegram users** sharing one deployment. Behaviour splits into two layers:

| Layer | What it is | Where it lives | Changes when |
| ----- | ---------- | -------------- | ------------ |
| **Core** | Product invariants: voice, tool rules, routing order, pillar boundaries | Code — `magnusCorePrompt.ts`, specialist static prompts, `orchestratorIntent.ts`, `healthRouter.ts` | You ship a code release |
| **Personalised** | Who the user is and what Magnus knows about them | Supabase per `user_profile_id` | Each user, each turn |

### Core (user-agnostic)

- **Magnus system prompt** — `MAGNUS_CORE_SYSTEM` in `src/agents/magnusCorePrompt.ts`. Composed at runtime with `buildMagnusSystem({ displayName })`.
- **Specialist identity line** — `buildSpecialistIdentity(ctx)` in `src/agents/promptIdentity.ts`.
- **Classifier** — `CLASSIFY_SYSTEM` in `src/agents/orchestratorIntent.ts` (five intents only).
- **Routing** — Plan parser + executors per pillar; health deterministic gates before parser; event-log invariants.
- **Integrations (process)** — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are deployment-level OAuth client credentials only.

### Personalised (per `user_profile_id`)

| Data | Table / source | Used for |
| ---- | -------------- | -------- |
| Identity | `user_profile.display_name`, `timezone`, `north_star_goal`, `user_tier`, `access_flags` | Prompt composition, memory block, morning brief |
| Chat + memory | `magnus_chat_messages`, `memory_summaries` | Verbatim history, rolling summary, semantic facts |
| Event log | `magnus_events` | Commitments, adherence, calendar link |
| Health onboarding | `user_health_profile` | Four-question gate → `healthPreferences` on health turns |
| Program memory | `user_program_memory` | Health coaching context — **not** shared disk files |
| Integrations | `user_integrations` | Calendar, Hevy, Notion, YouTube, Kite per user |
| Journal | `magnus_daily_logs` | Recent EOD entries in health context |

### Turn assembly (`AgentContext`)

Each turn the orchestrator builds `AgentContext` (`src/agents/types.ts`) with `userProfileId`, `displayName`, `timezone`, `northStarGoal`, `memoryPackage`, and (for health) `healthPreferences` + `healthReferenceBlock`.

### Provisioning a user

- **New Telegram user** — `resolveTelegramUserProfile` creates a minimal row (`timezone: UTC`). Access requires `allowlisted=true` or `MAGNUS_AUTO_ALLOWLIST_NEW_USERS=true`.
- **Owner reset + seed** — `npx tsx scripts/provision-owner-user.mts` with `TELEGRAM_USER_ID`.

---

## Status snapshot (2026-08-13)

| Area | In code today |
|------|----------------|
| Five intents | `src/intent.ts` — `HEALTH`, `WEALTH`, `HAPPINESS`, `WISDOM`, `GENERAL` |
| Orchestrator | `magnusOrchestrator.ts` — classify → memory → plan parser → execute → compose |
| Magnus tools | `magnusAgent.ts` — calendar, event log, YouTube, lists, LifeOS, Notion, Kite connect, proactive |
| Health composite | `healthRouter.ts` — gates + plan parser + meal planning journey |
| Shallow pillars | `wealthAgent`, `happinessAgent`, `wisdomAgent` — plan parser + `runPillarSpecialist` / Kite read |
| Memory | `memory/` — tiered context, user knowledge, post-turn maintenance |
| Morning Brief | `jobs/morningBrief.ts` — cron, plain `morning brief`, `POST /internal/jobs/morning-brief` |
| Proactive Telegram | `proactive/` — cron jobs + subscription kinds |
| Capability catalogs | `routing/pillarStrategy/catalogs/` — parser steps per pillar |
| User-query catalog | 158 asks in `capabilities/userQueryCatalog.ts` |

**Deferred:** Semantic embeddings, Kite write, morning brief reading Google Calendar, full LifeOS KPI writers. See `magnus.md` Not built yet.

**Live wiring diagram:** `docs/TOOLS_AND_AGENTS.md`.

---

## 1. Telegram bot (surface)

**Scope:** Inbound user messages from Telegram; outbound replies; proactive sends via Telegraf.

**Actions (today)**

- Long-poll or webhook → `handleMessage`.
- **Morning brief:** plain `morning brief` or legacy `/morningbrief` text → `runMorningBrief` (not a registered BotCommand).
- Persist user + assistant turns to `magnus_chat_messages` (intent in metadata).
- Enforce **allowlist** and **tier / `access_flags.chat`** before LLM calls.
- **Rate limit** inbound text per Telegram user (Redis fixed window).
- **Health HTTP:** `GET /health`, `GET /ready`; **internal:** `POST /internal/jobs/morning-brief` (auth secret).

**Fixed strings (not LLM)**

| Key | Text |
| --- | --- |
| Not allowlisted | `You're not allowlisted to use Magnus yet. Ask an admin to enable your account.` |
| Tier / no chat | `Your access tier doesn't include chat right now. We'll expand this soon.` |
| Error fallback | `Something went wrong. Check server logs.` |

Registered commands: `/start`, `/help` only (`src/config/telegramCommands.ts`).

---

## 2. Magnus — orchestrator

**Status:** **Implemented** — `src/magnus.ts`, `src/agents/magnusOrchestrator.ts`, `src/agents/magnusAgent.ts`, `src/agents/registry.ts`.

**System prompt — Magnus (GENERAL)** — `src/agents/magnusCorePrompt.ts` (`MAGNUS_CORE_SYSTEM` + `buildMagnusSystem`).

**Intent classification** — `src/agents/orchestratorIntent.ts` (`CLASSIFY_SYSTEM`). Exactly one of:
`HEALTH | WEALTH | HAPPINESS | WISDOM | GENERAL`. Read the live prompt in source; do not copy stale nine-intent versions from old docs.

**Turn flow**

1. `resolveIntentNaturalLanguage` (+ routing hints, meal/YouTube/Magnus-tool overrides).
2. `loadMemoryContext` + `buildMemoryPackage`.
3. Pillar plan parser (`parsePillarExecutionPlan`) or Magnus tool loop on GENERAL.
4. `vetAndCompose` / `finalizeMagnusVoice` — one Magnus voice at exit.

---

## 3. Intent → runtime agent

| Intent | Agent | Path |
| ------ | ----- | ---- |
| `GENERAL` | Magnus | `executeGeneralStrategy` → `magnusAgent` tools, `day_overview`, `pillar_consultation` |
| `HEALTH` | Health composite | `healthRouter.ts` → `executeHealthStrategy` |
| `WEALTH` | Wealth | `wealthAgent.ts` → plan parser + Kite read context |
| `HAPPINESS` | Happiness | `happinessAgent.ts` → plan parser + `runPillarSpecialist` / ops tools |
| `WISDOM` | Wisdom | `wisdomAgent.ts` → plan parser + `runPillarSpecialist` / ops tools |

Fine-grained behaviour is **capability steps** in each pillar catalog (`routing/pillarStrategy/catalogs/`), not legacy department names (`BUILD`, `PLANNING`, `NOTION`, …).

---

## 4. Specialist prompts (implemented)

| Specialist | System prompt source | Notes |
| ---------- | -------------------- | ----- |
| Magnus (GENERAL) | `magnusCorePrompt.ts` | Tools via `magnusAgent.ts` |
| Health sub-agents | `agents/health/*Agent.ts`, `mealParserPrompt.ts` | Meal, fitness, journal, planning, … |
| Wealth | `wealthAgent.ts` — `WEALTH_SYSTEM` | Read-only Zerodha context when connected |
| Happiness | `happinessAgent.ts` — `HAPPINESS_SYSTEM` | Taste, leisure, relationships |
| Wisdom | `wisdomAgent.ts` — `WISDOM_SYSTEM` | Learning, career, shipping |

Shared runner for shallow pillars: `pillarSpecialist.ts` (`runPillarSpecialist`, `runAgentWithTools` for ops tools).

---

## 5. Maintenance

When you change `CLASSIFY_SYSTEM` or `MAGNUS_CORE_SYSTEM`, update **§2** here. When a specialist prompt changes, update **§4**. For tools, proactive jobs, and integrations, update `docs/TOOLS_AND_AGENTS.md`.

---

## Changelog

| Date | Change |
| ---- | ------ |
| 2026-04-12 | Initial roster |
| 2026-08-02 | §0 Core vs personalised context; per-user program memory |
| 2026-08-09 | Five-intent snapshot; pointer to TOOLS_AND_AGENTS |
| 2026-08-13 | Trimmed legacy §4–6 draft departments; aligned classifier and morning-brief triggers with code |
