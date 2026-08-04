# Magnus — Impartial Architecture & Code Review

**Reviewer stance:** Third-party technical audit. No ownership of prior design decisions.  
**Date:** 2026-08-04  
**Scope:** Full repository — runtime, agents, integrations, database, ops, documentation.  
**Ground truth:** `magnus.md` (runtime), code under `src/`, 18 Supabase migrations, 75 test files.

---

## Executive summary

Magnus is a **well-scoped, production-deployable Telegram AI orchestrator** with a clear product identity (one voice, four pillars, Magnus owns tools). The codebase is **mature for a single-replica personal bot** (~165 source files, ~75 test files, Docker + Railway, proactive cron, OAuth flows, event-log domain model).

The largest risks are **not code quality** but **architectural drift**: a broad LifeOS database schema that the app mostly reads but does not write, documentation that lags the code by months, and a security model that assumes a single trusted service role with no per-user DB isolation.

**Overall grade: B (78/100)** — strong spine, uneven depth, recoverable debt.

| Dimension | Grade | Score |
|-----------|-------|-------|
| Architecture clarity | B+ | 85 |
| Code quality & conventions | B+ | 84 |
| Security & data protection | C+ | 72 |
| Database design & reproducibility | C+ | 71 |
| Testing & CI | B- | 78 |
| Documentation accuracy | C | 68 |
| Operational readiness | B+ | 86 |
| Vision ↔ implementation alignment | C+ | 70 |

---

## What is working well

### 1. Product architecture is coherent

- **Single user-facing voice** — routing is invisible; metadata records `delegated_agent` internally.
- **Clear ownership split** — Magnus (`GENERAL`) has tools; pillars are specialists. Health earned depth; others are intentionally shallow.
- **Turn contract is simple** — one message in, one reply out; chunking only for Telegram limits.
- **Event log design is excellent** — immutable reschedule chains, activity keys, reminder hooks, calendar sync. This is production-grade domain modeling.

### 2. Runtime hardening

- Webhook fast-ack + Redis `update_id` dedupe (24h).
- Watchdog exits on Telegram failure → host restart.
- Capability report (`magnusCapabilities.ts`) maps env → features at boot.
- Pino logging with token redaction; Telegram user IDs masked in production.
- Graceful shutdown with timeout cap.

### 3. Code organization

- Import graph audit script (`scripts/dev/import-graph.mts`).
- Consistent ESM + TypeScript patterns.
- Heavy unit test coverage on critical paths (orchestrator intent coercion, OAuth state, event store, meal pipeline, proactive cron).
- Multi-user personalization cleanly separated: core prompts in code, per-user data in Supabase.

### 4. Integration patterns

- OAuth state in Redis (15 min TTL, consume-once).
- Per-user tokens in `user_integrations` — correct for multi-user on one deployment.
- Unified Google OAuth (Calendar + YouTube) reduces consent friction.

---

## Issues, leakages, and ambiguities

### Critical / High

| # | Issue | Evidence | Impact |
|---|-------|----------|--------|
| H1 | **Service role = root access** | All tables use `service_role_only` RLS; app uses `SUPABASE_SERVICE_ROLE_KEY` | Key compromise exposes all user OAuth tokens, Hevy keys, chat history |
| H2 | **Schema not reproducible from repo** | `magnus.md` § Database; only ~12 tables in migrations; `user_profile`, `magnus_chat_messages`, 30+ LifeOS tables applied ad hoc | New environments, audits, and disaster recovery are blocked |
| H3 | **Memory reads 15+ tables nothing writes** | `memoryAgent.ts`, `morningBriefContext.ts` read `goals`, `patterns`, `happiness_reserve`, etc. | Wasted queries; false `gaps` signal; misleading brief sections |
| H4 | **Plaintext secrets in Postgres** | `user_integrations` stores refresh tokens, API keys as TEXT | Expected for server-side use, but no app-layer encryption or rotation hooks |

### Medium

| # | Issue | Evidence | Impact |
|---|-------|----------|--------|
| M1 | **Fail-open on Redis errors** | `rateLimit.ts:30` — allows message on Redis failure | Rate limit bypass; possible duplicate processing if dedupe also fails |
| M2 | **Auto-allowlist default `true`** | `.env.example:18` | Any Telegram user gets full access unless explicitly disabled |
| M3 | **Unauthenticated OAuth diagnostics** | `GET /oauth/google`, `/oauth/notion`, `/oauth/kite` return `client_id`, redirect URIs | Aids targeted OAuth phishing; information disclosure |
| M4 | **Documentation contradictions** | `docs/ARCHITECTURE.md` says "single user"; `magnus.md` says multi-user. `MAGNUS_CORE_CONTEXT.md` dated 2026-04-12 references removed intents (`NOTION`, `PLANNING`) | Onboarding friction; wrong mental model for contributors |
| M5 | **Dual morning-brief cron paths** | `jobs/morningBriefCron.ts` (legacy) vs `proactive/cron.ts` (current); overlapping env flags | Confusion about which path runs in production |
| M6 | **Joy vs Happiness naming** | DB/events use `joy` pillar; agents use `HAPPINESS` intent; LifeOS docs say "Joy" | Cross-layer mapping errors |
| M7 | **Webhook secret derived from bot token** | `sha256(token):magnus-webhook` | Anyone with bot token can forge webhook if they know path hash |
| M8 | **12 test files fail without dummy env** | CI sets vars; local `npm test` without `.env` fails on `clients.ts` | Developer experience; easy to miss in partial runs |

### Low / Technical debt

| # | Issue | Evidence |
|---|-------|----------|
| L1 | Three Google auth paths | env refresh token, local token file, per-user DB + unified OAuth |
| L2 | Legacy `/oauth/youtube/*` aliases | Redirect to unified Google flow |
| L3 | Wealth/Happiness/Wisdom shallow | Single prompt via `pillarSpecialist.ts`; Wealth has Kite read-only only |
| L4 | Morning Brief skips Google Calendar | Reads event log + LifeOS tables only |
| L5 | No semantic/vector memory | Recent window + structured reads; no pgvector |
| L6 | No E2E tests | No live Telegram/Supabase integration suite |
| L7 | `npm audit` vulnerabilities | Present after `npm ci` (not triaged in this review) |
| L8 | Empty `scheduler/` reference | Cron lives in `proactive/` |

---

## Redundancies

1. **Notion access paths** — internal integration token (scripts) + OAuth public connection (in-chat) + legacy registry JSON.
2. **List storage** — Supabase canonical (`magnus_user_lists`) + optional Notion mirror per list (intentional, but sync complexity).
3. **Health program memory** — DB (`user_program_memory`) + committed `.cursor/skills/health/references/` templates (docs say templates only; verify no owner-specific content in repo).
4. **Morning brief implementations** — `jobs/morningBrief.ts` content generation + `proactive/jobs/morningBriefJob.ts` delivery wrapper + legacy cron.
5. **Google Calendar auth** — four paths (see L1).

---

## Ambiguities requiring decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| LifeOS tables | (A) Wire writers from agents/tools, (B) Stop reading empty tables, (C) Drop unused tables | **B short-term, A phased** — stop `gaps` noise first; add writers per pillar as depth is earned |
| Multi-user posture | Single-owner bot vs true multi-tenant | Document as **multi-user-capable single deployment**; disable auto-allowlist in production |
| Pillar naming | Joy/Happiness, Wisdom/Build/Learning | Publish canonical mapping table; align DB CHECK constraints in next migration |
| Notion role | Human-readable mirror vs source of truth | **Supabase canonical** (already decided in code); finish mirroring or drop half-built paths |
| Kite write path | Build orders vs stay read-only | Stay read-only until static IP + CONFIRM flow; MF writes blocked by Zerodha 403 |

---

## Cleanup plan (prioritized)

### Phase 0 — Documentation & truth (1–2 sessions, no behavior change)

- [x] Create this review + product doc suite (`docs/product/*`, `docs/DATABASE_SCHEMA.md`, `docs/diagrams/`)
- [ ] Reconcile `docs/ARCHITECTURE.md`, `MAGNUS_CORE_CONTEXT.md` with `magnus.md` (or mark deprecated sections)
- [ ] Add canonical **pillar/intent/DB mapping** table to `docs/AGENT_ROSTER.md`
- [ ] Document which cron path is authoritative (`proactive/cron.ts`)

### Phase 1 — Schema baseline (high priority)

- [ ] `supabase db dump` or MCP `list_tables` → generate baseline migration for pre-April-2026 tables
- [ ] Add `user_profile`, `magnus_chat_messages` to `supabase/migrations/`
- [ ] CI step: `supabase db reset` + apply all migrations on ephemeral Postgres
- [ ] Mark `scripts/magnus_db_hardening.sql` as superseded or fold into migrations

### Phase 2 — Security hardening

- [ ] Set `MAGNUS_AUTO_ALLOWLIST_NEW_USERS=false` in production; explicit provision script only
- [ ] Rate limit / dedupe: **fail-closed** or circuit-breaker when Redis unavailable (configurable)
- [ ] Protect OAuth diagnostic routes (Bearer admin secret or remove in production)
- [ ] Rotate webhook secret to independent `TELEGRAM_WEBHOOK_SECRET` (not derived from bot token)
- [ ] Audit log for `user_integrations` reads (optional Supabase audit extension)

### Phase 3 — Memory & LifeOS alignment

- [ ] Gate LifeOS table reads behind `MAGNUS_MEMORY_INCLUDE_LIFEOS=true` (separate from gaps flag)
- [ ] Implement minimal writers for highest-value tables: `goals`, `daily_plans`, `pillar_status` via Magnus tools
- [ ] Or: remove reads for tables with zero rows after 90 days (telemetry first)
- [ ] Morning Brief: add Google Calendar read when connected (optional section)

### Phase 4 — Pillar depth & deduplication

- [ ] Deprecate `jobs/morningBriefCron.ts`; single proactive registry
- [ ] Consolidate Google auth to: unified OAuth (per-user) + script-only local dev fallback
- [ ] Wealth: define tool surface (budget read, goal CRUD) before expanding Kite
- [ ] Happiness: wire list recommendation tool (`docs/TODO_LIST_RECOMMENDATION_SCHEMAS.md`)
- [ ] Wisdom: project/shipping tracker tied to `projects`/`features` tables or drop those reads

### Phase 5 — Quality & observability

- [ ] Vitest global setup with CI dummy env (fix 12 failing test file imports)
- [ ] E2E smoke: webhook POST → mock orchestrator → assert chat row
- [ ] External uptime on `/ready` (documented in `magnus.md` but not enforced)
- [ ] OpenTelemetry or structured trace id per turn (`update_id` → log correlation)
- [ ] `npm audit fix` triage

---

## Grading rubric (how scores were assigned)

| Grade | Meaning |
|-------|---------|
| A (90+) | Production-grade; minimal debt; reproducible; well-tested |
| B (80–89) | Solid; deployable; known debt with clear owners |
| C (70–79) | Functional; significant drift or gaps; needs planned cleanup |
| D (60–69) | Risky for production without remediation |
| F (<60) | Not shippable |

Magnus scores **B overall** because the **core loop works and is deployable**, but **schema reproducibility, documentation staleness, and security defaults** prevent an A without the cleanup phases above.

---

## Appendix: file hotspots for review

| Area | Key files |
|------|-----------|
| Turn pipeline | `src/magnus.ts`, `src/agents/magnusOrchestrator.ts` |
| Access control | `src/magnus.ts`, `src/tools/chatLog.ts`, `src/tools/rateLimit.ts` |
| Magnus tools | `src/agents/magnusAgent.ts`, `src/agents/tools/*` |
| Health depth | `src/agents/health/healthRouter.ts`, `src/pillars/health/*` |
| Memory | `src/agents/memory/memoryAgent.ts` |
| Event log | `src/events/eventStore.ts`, `supabase/migrations/20260731120000_magnus_events.sql` |
| Proactive | `src/proactive/cron.ts`, `src/proactive/registry.ts` |
| HTTP surface | `src/healthServer.ts` |
| Secrets | `src/users/userIntegrations.ts` |

---

*Next review recommended after Phase 1 (schema baseline) and Phase 2 (security) complete.*
