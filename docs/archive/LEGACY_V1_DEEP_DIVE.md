# Magnus v1 — deep-dive archive (production retired)

**Status:** Parked **2026-09-14**. Magnus v1 is **not** served from the repository root.  
**Code tree:** [`archive/legacy-v1/`](../../archive/legacy-v1/)  
**Successor:** [`docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md`](../product/MAGNUS_V2_21_DAY_BUILD_PLAN.md) — clean-room **Python / FastAPI / PostgreSQL** Telegram MVP.

This document is the single entry point for understanding what v1 was, how it worked, what it cost, and what v2 should **not** inherit by default.

---

## 1. Why v1 was parked

v1 grew into a **multi-pillar LifeOS** (Operations · Goals · Projects on four pillars) with deep integrations (Google Calendar, YouTube, Notion, Hevy, Zerodha), heavy LLM orchestration, and broad surface area. The product direction shifted to:

- **Intelligence layer**, not system of record
- **Explicit** desired state → strategy → evidence → trajectory → diagnosis
- **Telegram-only** proof of architecture before any UI
- **Clean-room** implementation without copying the v1 domain model

Parking v1 avoids production accidentally running legacy paths while v2 is built day-by-day.

---

## 2. What v1 was (product)

| Aspect | v1 reality |
|--------|------------|
| **Interface** | Telegram bot (Telegraf), long polling or webhook |
| **Voice** | One “Magnus” voice; user never talked to pillar agents directly |
| **Routing** | Five intents: `GENERAL` (Magnus + tools) + `HEALTH`, `WEALTH`, `HAPPINESS`, `WISDOM` |
| **Activity model** | v1.0: Operations · Goals · Projects on top of pillars |
| **Trust** | Accountability Agent — terminal vet of writes, `action_ledger`, no false save claims |
| **Commands** | Only `/start` and `/help` registered; everything else natural language |
| **Users** | Multi-user: `user_profile` per Telegram chat, allowlist gate |
| **“Minimal mode”** | Runtime scope fence in `config/minimalMode.ts` — same binary, filtered capabilities |

**North-star tension:** v1 tried to be companion + integrator + specialist depth (especially health/meals) in one Node process. v2 narrows to the **control loop**: Intent → Strategy → Action → Reality → Observation → Diagnosis → Adaptation.

---

## 3. Technology stack (v1)

| Layer | Choice |
|-------|--------|
| Runtime | Node.js ≥ 20, TypeScript ESM |
| Entry | `archive/legacy-v1/src/index.ts` |
| Bot | Telegraf |
| HTTP | Express — `/health`, `/ready`, OAuth callbacks, webhook, internal morning-brief job |
| Primary DB | Supabase Postgres (`xdrpjfdhduskhzryevze`, ap-northeast-1) |
| Cache / dedupe | Upstash Redis |
| LLM | Anthropic — Sonnet for classify/agents, Haiku for parsers/composers |
| Deploy | Railway, `Dockerfile`, `railway.toml`, one replica, restart ALWAYS |
| Migrations | `archive/legacy-v1/supabase/migrations/` |

---

## 4. Architecture (high level)

```
Telegram update
  → magnus.ts (allowlist, persist user message, typing)
  → assembleRoutingContext + routingContextParser (Haiku hints)
  → orchestratorIntent (5-way Sonnet classify)
  → magnusOrchestrator
        → pillar plan parser (Haiku steps[])
        → step executors (tools on GENERAL/Health; prompt-only other pillars)
        → accountabilityAgent + finalizeMagnusVoice
  → reply HTML + magnus_chat_messages assistant row
```

**Key modules** (paths under `archive/legacy-v1/src/`):

| Area | Paths | Notes |
|------|-------|-------|
| Orchestration | `agents/magnusOrchestrator.ts`, `orchestratorIntent.ts` | Turn budget, project-setup prelude, memory |
| Routing context | `agents/context/`, `agents/routing/routingContextParser.ts` | Frontload before classify |
| Pillar strategy | `agents/routing/pillarStrategy/` | Parse → execute → compose pipeline |
| Magnus tools | `agents/magnusAgent.ts`, `agents/tools/*` | Calendar, lists, events, YouTube, Notion connect |
| Health depth | `agents/health/`, `meals/`, `nutrition/`, `pillars/health/workouts/` | Hevy, meal intake parser, planning journey |
| Projects | `projects/` | Setup FSM, themes, conflict detection |
| Memory | `agents/memory/` | Topics, embeddings (pgvector), recall tool |
| Proactive | `proactive/`, `jobs/morningBrief.ts` | Cron, subscriptions, rhythm kinds |
| Logging FSM | `logging/` | Evening journal, activity completion |
| Integrations | `integrations/google*`, `integrations/notion/`, wealth Kite | Per-user tokens in `user_integrations` |

**Companion docs (in archive):** `archive/legacy-v1/docs/ARCHITECTURE.md`, `TOOLS_AND_AGENTS.md`, `DATABASE_SCHEMA.md`, `review/MINIMAL_MODE_MODULE_MAP.md`.

---

## 5. Integrations (v1)

| Integration | Purpose | Storage |
|-------------|---------|---------|
| Google Calendar | Read/write events, sync `magnus_events` | `user_integrations` refresh token |
| YouTube / YT Music | Search, playlists, bookmarks, cue | Same Google OAuth |
| Notion | LifeOS hub, journal, list mirror | Notion OAuth + registry |
| Hevy | Workouts, gym ↔ event reconcile | API key per user |
| Zerodha Kite | Read-only portfolio (Wealth) | Kite OAuth |
| USDA / CalorieNinjas | Meal macro estimates | Host env keys |

v2 plan **explicitly defers** these until after the 21-day Telegram intelligence MVP.

---

## 6. Database (v1) — conceptual inventory

**Heavily written tables:** `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `magnus_events`, `meal_logs`, `meal_daily_rollups`, `meal_plan_*`, `user_health_profile`, `user_program_memory`, `user_integrations`, `memory_summaries`, `memory_topics`, `memory_embeddings`, `projects`, `project_sessions`, `features`, `magnus_youtube_*`, `magnus_proactive_subscriptions`, `magnus_user_lists`, …

**LifeOS read-mostly:** `goals`, `pillar_status`, `kpi_readings`, `daily_scores`, etc.

**Security posture (late v1):** RLS `service_role_only`; GraphQL roles revoked; Magnus used service role only.

Full ERD: `archive/legacy-v1/docs/DATABASE_SCHEMA.md`.

---

## 7. Behaviour highlights worth remembering

1. **LLM proposes, code commits** — meal plans, reversible undo, read-before-write on calendar deletes.
2. **Minimal mode** — parked pillars/meals at runtime without deleting code (Phase B “parked in production”).
3. **Proactive catalog** — morning brief, evening journal, gym/Hevy reconcile, nutrition nightly, many subscription kinds; adaptive daily cap.
4. **Photo routing** — `src/vision/` inferred purpose before pillar routing.
5. **Accuracy suite** — `npm run test:accuracy` and review gate docs under `archive/legacy-v1/docs/review/`.

---

## 8. Operational snapshot (v1)

- **Boot requirements:** `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Upstash Redis URLs.
- **Provision:** `scripts/provision-owner-user.mts`, `allowlisted` on `user_profile`.
- **Telegram:** `npm run telegram:setup` — webhook recommended on Railway.
- **Tracker:** `archive/legacy-v1/magnus.md` (frozen).

---

## 9. Lessons for v2 (do not repeat by default)

| v1 pattern | v2 direction |
|------------|--------------|
| Giant orchestrator + many Haiku/Sonnet calls per turn | Explicit domain services; LLM for extraction/reasoning only |
| Goals/projects/meals/calendar as parallel product surfaces | Life objects: Outcome, Standard, Project, Exploration + strategy versioning |
| Implicit “try harder” coaching | Diagnosis taxonomy: execution vs routine vs strategy vs goal vs information |
| JSON-heavy plan steps | Validated commands; events ledger + current-state tables |
| Multi-pillar invisible routing | Single intelligence loop; Telegram adapter thin |
| Breadth-first integrations | Manual evidence in Telegram for 21 days |

**Keep (ideas, not code):** accountability for user trust, conversation persistence, webhook + dedupe, versioned strategies, separating adherence from trajectory.

---

## 10. Credentials and infra

- Rotate secrets if v1 repos or chats were ever exposed.
- Supabase project and Telegram bot **identity** may be reused for v2; **schema** should be new (Alembic on fresh DB or new project per clean-room policy).
- Railway env vars for v1 should be **removed or pointed at maintenance shell** only (`MAGNUS_V1_RETIRED=true` behaviour at root).

---

## 11. File index (quick)

```
archive/legacy-v1/
  src/                 # ~all application logic
  scripts/             # ops & dev scripts
  supabase/migrations/
  docs/                # full v1 documentation set
  magnus.md            # v1 tracker
  MAGNUS_CORE_CONTEXT.md
  mcp/google-calendar/ # Cursor MCP helper, not production bot
```

**Production (post-park):** repository root `src/` — maintenance HTTP + optional Telegram offline message only.

---

## 12. Related documents

| Document | Role |
|----------|------|
| [`MAGNUS_V2_21_DAY_BUILD_PLAN.md`](../product/MAGNUS_V2_21_DAY_BUILD_PLAN.md) | Authoritative build plan |
| [`../../magnus.md`](../../magnus.md) | Live v2 tracker |
| [`../../archive/README.md`](../../archive/README.md) | Archive policy |

---

*Last updated: 2026-09-14 — v1 retired, archive frozen.*
