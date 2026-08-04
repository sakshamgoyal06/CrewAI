# Magnus — Technical Requirements Document (TRD)

**Version:** 1.0  
**Last updated:** 2026-08-04  
**System:** Magnus Node.js Telegram Bot  
**Companion:** `docs/product/ARD.md`, `magnus.md`

---

## 1. Purpose

Specifies **how** the Magnus system must be built and operated: stack, interfaces, data contracts, performance, security, and deployment. Implements requirements from PRD/BRD.

---

## 2. System overview

| Attribute | Specification |
|-----------|---------------|
| **Language** | TypeScript 5.x, ESM |
| **Runtime** | Node.js ≥ 20 |
| **Entry point** | `src/index.ts` |
| **Process model** | Single process, single replica |
| **Dev runner** | `tsx watch src/index.ts` |
| **Production** | `tsc` → `node dist/index.js` in Docker Alpine |

---

## 3. External interfaces

### 3.1 Telegram Bot API

| Mode | Config | Requirement |
|------|--------|-------------|
| Webhook | `MAGNUS_TELEGRAM_MODE=webhook` | POST to `/telegram/{sha256_prefix}`; validate `X-Telegram-Bot-Api-Secret-Token` |
| Polling | default dev | Only one poller per token; 409 conflict detection |

**Message format:** HTML (`parse_mode: HTML`)  
**Chunk size:** Split at Telegram limit via `telegramChunk.ts`

### 3.2 HTTP server (Express)

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/health` | GET | None | 200 always (liveness) |
| `/ready` | GET | None | 200 if Redis + Supabase OK |
| `/oauth/google/callback` | GET | OAuth state | HTML success/error |
| `/oauth/notion/callback` | GET | OAuth state | HTML success/error |
| `/oauth/kite/callback` | GET | OAuth state | HTML success/error |
| `/internal/jobs/morning-brief` | POST | Bearer `MAGNUS_INTERNAL_JOB_SECRET` | 401 if secret unset/wrong |

### 3.3 Anthropic API

| Use | Model | Notes |
|-----|-------|-------|
| Intent classification | `claude-sonnet-4-6` | `orchestratorIntent.ts` |
| Magnus agent | `claude-sonnet-4-6` | Tool loop, max `MAGNUS_MAX_TOOL_ROUNDS` (default 12) |
| Pillar specialists | `claude-sonnet-4-6` | Single-turn prompt |
| Meal web research | `claude-sonnet-4-6` + `web_search` | Optional, env-gated |

### 3.4 Supabase

- Client: `@supabase/supabase-js` with service role key
- All queries MUST filter by `user_profile_id` for user data
- Migrations in `supabase/migrations/` — apply via `npm run db:apply` or CLI

### 3.5 Upstash Redis

- REST client via `@upstash/redis`
- Required at boot (6 env vars)
- Keys documented in `docs/DATABASE_SCHEMA.md` §7

---

## 4. Data requirements

### 4.1 Identity

```
telegram_chat_id (string) → user_profile.id (UUID)
```

All domain tables: `user_profile_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE`.

### 4.2 Chat persistence

Each turn writes two rows to `magnus_chat_messages`:
1. User message (`role: user`)
2. Assistant message (`role: assistant`, `metadata` includes intent, delegated_agent)

Proactive messages: `message_type: automated`, `delivery_trigger` set.

### 4.3 Event log invariants

- `status` transitions append to `status_history` (max 50)
- Reschedule: `reschedule_of` → new row; trigger maintains `rescheduled_to`
- `root_event_id` shared across chain
- Idempotency: `idempotency_key` unique per user when set

### 4.4 Memory package

Built per turn in `memoryAgent.ts`:

| Source | Config env |
|--------|------------|
| Recent chat window | `MAGNUS_MEMORY_CHAT_WINDOW` |
| Rolling summary | `MAGNUS_MEMORY_SUMMARY_ENABLED` |
| Semantic facts | `MAGNUS_MEMORY_SEMANTIC_ENABLED` |
| LifeOS gaps | `MAGNUS_MEMORY_INCLUDE_GAPS` (default off) |

Post-turn: `runPostTurnMemoryMaintenance` updates summary + facts.

---

## 5. Agent architecture

### 5.1 Orchestrator pipeline

```
fetchUserHealthProfile
→ onboarding gate (unless meal log)
→ resolveIntentNaturalLanguage (with recent routing context)
→ loadMemoryContext + buildMemoryPackage
→ route: GENERAL → runMagnusAgent | else dispatchToAgent
```

### 5.2 Tool loop (Magnus only)

- Anthropic tool_use protocol
- Tools defined in `src/agents/tools/*.ts`
- Calendar: read required before update/delete
- Cap: `MAGNUS_MAX_TOOL_ROUNDS`

### 5.3 Health router (first-accept)

Order: meal log → journal → Hevy write → fitness → nutrition → generic ack.

---

## 6. Security requirements

| ID | Requirement | Current | Target |
|----|-------------|---------|--------|
| SEC-1 | Service role never exposed to client | ✓ | Maintain |
| SEC-2 | OAuth state single-use, TTL 15m | ✓ | Maintain |
| SEC-3 | Webhook secret validation | ✓ | Independent secret (not derived from bot token) |
| SEC-4 | Rate limit fail-closed on Redis error | ✗ fail-open | Configurable fail-closed in prod |
| SEC-5 | Auto-allowlist disabled in production | ✗ default true | `false` in prod |
| SEC-6 | OAuth diagnostic routes protected | ✗ open | Admin auth or prod disable |
| SEC-7 | Pino redact tokens/passwords | ✓ | Maintain |
| SEC-8 | Telegram user id masked in prod logs | ✓ | Maintain |

---

## 7. Performance requirements

| Metric | Target |
|--------|--------|
| Webhook ack | < 200ms (async processing) |
| Simple turn (no tools) | < 15s p95 |
| Tool-heavy turn | < 60s p95 |
| Proactive cron tick | < 30s for all due jobs |
| Memory load | < 2s p95 (Supabase queries) |

---

## 8. Reliability requirements

| ID | Requirement |
|----|-------------|
| REL-1 | Watchdog exits after 5 consecutive Telegram probe failures |
| REL-2 | Graceful shutdown within 10s on SIGTERM |
| REL-3 | Webhook dedupe prevents double-reply on retry |
| REL-4 | Railway restart policy ALWAYS |
| REL-5 | External uptime on `/ready` recommended |

---

## 9. Environment variables

**Required (6):** `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

Full list: `.env.example` (~160 lines, grouped by purpose).

Capability matrix: `npm run telegram:check` → `config/magnusCapabilities.ts`.

---

## 10. Testing requirements

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit | Vitest 3 | 75 test files; target critical paths |
| CI | GitHub Actions | `npm ci`, `build`, `test` with dummy env |
| Smoke | `npm run test:supabase` | Insert/delete + memory_summaries reachability |
| E2E | — | **Not required yet**; planned webhook → chat row |

**Gap:** 12 test files fail without env vars on import — add Vitest `setupFiles` with CI dummy values.

---

## 11. Deployment requirements

| Item | Specification |
|------|---------------|
| Container | Multi-stage Docker, Node 20 Alpine |
| Host | Railway (`railway.toml`, restart ALWAYS) |
| Public URL | `MAGNUS_PUBLIC_BASE_URL` or platform auto-detect |
| OAuth redirects | Must match Google/Notion/Kite console exactly |
| Replicas | 1 (webhook mode); polling forbids overlap |

---

## 12. Observability

| Signal | Implementation |
|--------|----------------|
| Logs | Pino JSON, `LOG_LEVEL` env |
| Correlation | `update_id`, `telegramUserId` (masked), `module` child loggers |
| Health | `/health`, `/ready` |
| Metrics | **Not implemented** — recommend turn latency histogram |
| Tracing | **Not implemented** — recommend OpenTelemetry |

---

## 13. Dependencies (major)

| Package | Purpose |
|---------|---------|
| `telegraf` | Telegram |
| `express` | HTTP server |
| `@anthropic-ai/sdk` | Claude |
| `@supabase/supabase-js` | Database |
| `@upstash/redis` | Redis |
| `googleapis` | Calendar + YouTube |
| `@notionhq/client` | Notion |
| `node-cron` | Proactive scheduler |
| `pino` | Logging |
| `zod` | Validation (MCP, some tools) |

---

## 14. Technical debt register

| ID | Item | Priority |
|----|------|----------|
| TD-1 | Baseline migration for hosted-only tables | P0 |
| TD-2 | Vitest global env setup | P1 |
| TD-3 | Remove legacy `morningBriefCron.ts` | P2 |
| TD-4 | Consolidate Google auth paths | P2 |
| TD-5 | LifeOS table read/write alignment | P1 |
| TD-6 | `npm audit` triage | P2 |

See `docs/review/IMPARTIAL_REVIEW_2026-08-04.md` for full cleanup plan.

---

## 15. Related documents

- `docs/product/ARD.md` — architecture decisions
- `docs/DATABASE_SCHEMA.md` — schema reference
- `docs/diagrams/ARCHITECTURE_DIAGRAMS.md` — visual diagrams
