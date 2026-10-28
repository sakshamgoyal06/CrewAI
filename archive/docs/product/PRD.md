# Magnus — Product Requirements Document (PRD)

**Version:** 1.0  
**Last updated:** 2026-08-04  
**Product:** Magnus Telegram Bot  
**Status:** Living document — reflects shipped + planned features

---

## 1. Product summary

Magnus is a Telegram-based AI chief of staff. Users send plain language; Magnus replies in one voice. Internally, messages route to pillar specialists (Health, Wealth, Happiness, Wisdom) or Magnus himself (tools). Users never see routing.

**Primary interface:** Telegram  
**Commands:** `/start`, `/help` only — everything else is natural language

---

## 2. User personas

### 2.1 Owner (primary)

- Power user of LifeOS philosophy
- Wants proactive morning brief, event log, health tracking, calendar control
- Provisions integrations via OAuth in chat or scripts
- Timezone-aware; expects Magnus to know program schedule

### 2.2 Provisioned user

- Allowlisted Telegram user on shared deployment
- Gets neutral defaults until onboarded
- May have subset of integrations connected
- Same single-voice experience

### 2.3 Operator

- Runs deployment, rotates secrets, provisions users
- Uses `npm run telegram:check`, `/ready`, external uptime

---

## 3. User stories (by epic)

### Epic A — Conversation core

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| A-1 | As a user, I send a message and receive one coherent reply | P0 | **Done** |
| A-2 | As a user, I never see which specialist answered | P0 | **Done** |
| A-3 | As a user, `/start` and `/help` work without API cost | P0 | **Done** |
| A-4 | As a user, my conversation history informs context | P0 | **Done** |
| A-5 | As a user, I am refused if not allowlisted | P0 | **Done** |
| A-6 | As a user, I am rate-limited to prevent abuse | P1 | **Done** |

### Epic B — Magnus tools (GENERAL intent)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| B-1 | As a user, I ask what's on my calendar and get accurate events | P0 | **Done** |
| B-2 | As a user, I create/update/delete calendar events via chat | P0 | **Done** |
| B-3 | As a user, I log commitments to an event log with reschedule history | P0 | **Done** |
| B-4 | As a user, I write journal notes mirrored to Notion when connected | P1 | **Done** |
| B-5 | As a user, I search YouTube, manage playlists, bookmark, cue playback | P1 | **Done** |
| B-6 | As a user, I connect Google with one OAuth link (Calendar + YouTube) | P1 | **Done** |
| B-7 | As a user, I manage lists (watchlist, reading, etc.) with optional Notion sync | P1 | **Done** |
| B-8 | As a user, I connect Notion and get a provisioned Magnus hub | P1 | **Done** |
| B-9 | As a user, I connect Zerodha for read-only portfolio context in wealth turns | P2 | **Done** |
| B-10 | As a user, calendar delete/update syncs linked event-log rows | P1 | **Done** |

### Epic C — Health pillar

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| C-1 | As a user, I log meals in natural language with macro estimates | P0 | **Done** |
| C-2 | As a user, I complete health onboarding before deep coaching | P1 | **Done** |
| C-3 | As a user, meal logging bypasses onboarding gate | P0 | **Done** |
| C-4 | As a user, I get fitness coaching with Hevy history and weekly schedule | P1 | **Done** |
| C-5 | As a user, I log Hevy routines via chat command | P2 | **Done** |
| C-6 | As a user, I write end-of-day health journal entries | P1 | **Done** |
| C-7 | As a user, I get nutrition advice when not logging | P2 | **Done** |

### Epic D — Wealth / Happiness / Wisdom pillars

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| D-1 | As a user, I get wealth coaching with Kite portfolio context | P2 | **Done** (read-only) |
| D-2 | As a user, I get happiness coaching on taste and rest | P2 | **Done** (prompt-only) |
| D-3 | As a user, I get wisdom coaching on learning and shipping | P2 | **Done** (prompt-only) |
| D-4 | As a user, I get list recommendations with filters (genre, rating, …) | P2 | **Planned** — see `docs/TODO_LIST_RECOMMENDATION_SCHEMAS.md` |
| D-5 | As a user, wealth goals persist to `goals` table | P2 | **Not started** |

### Epic E — Proactive

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| E-1 | As a user, I receive a morning brief at my local hour | P1 | **Done** |
| E-2 | As a user, I can trigger brief manually ("morning brief") | P1 | **Done** |
| E-3 | As a user, I receive reminders for event-log commitments | P1 | **Done** |
| E-4 | As a user, brief includes Google Calendar when connected | P2 | **Not started** |
| E-5 | As a user, I get nudges on inactivity patterns | P3 | **Not started** |

### Epic F — Memory

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| F-1 | As a user, recent chat is verbatim in context | P0 | **Done** |
| F-2 | As a user, older chat is summarized rolling | P1 | **Done** |
| F-3 | As a user, facts are extracted and recalled | P1 | **Done** |
| F-4 | As a user, semantic search over past reflections | P3 | **Not started** |
| F-5 | As a user, LifeOS KPIs (goals, joy tank) inform replies when populated | P2 | **Partial** — reads only |

---

## 4. Functional requirements

### 4.1 Access control

| Req ID | Requirement |
|--------|-------------|
| FR-AC-1 | System SHALL resolve Telegram user id to `user_profile` |
| FR-AC-2 | System SHALL refuse orchestrator for non-allowlisted users |
| FR-AC-3 | System SHALL respect `access_flags.chat` and `user_tier` |
| FR-AC-4 | System SHALL rate-limit per Telegram user (configurable, disable with 0) |
| FR-AC-5 | System SHALL dedupe Telegram `update_id` for 24 hours |

### 4.2 Orchestration

| Req ID | Requirement |
|--------|-------------|
| FR-OR-1 | System SHALL classify each turn to exactly one of five intents |
| FR-OR-2 | System SHALL coerce explicit meal logs to HEALTH |
| FR-OR-3 | System SHALL coerce YouTube actions to GENERAL (Magnus tools) |
| FR-OR-4 | System SHALL record `delegated_agent` in chat metadata only |
| FR-OR-5 | System SHALL gate health onboarding until four questions complete |

### 4.3 Event log

| Req ID | Requirement |
|--------|-------------|
| FR-EV-1 | Reschedule SHALL create new row; original row closed with link |
| FR-EV-2 | Duplicate log within 2h for same activity SHALL require `reschedule_event` |
| FR-EV-3 | Reminders SHALL fire at `remind_at` and set `reminded_at` |
| FR-EV-4 | Calendar delete/update SHALL sync linked `magnus_events` row |

### 4.4 Integrations

| Req ID | Requirement |
|--------|-------------|
| FR-IN-1 | OAuth state SHALL be single-use with 15-minute TTL |
| FR-IN-2 | Per-user tokens SHALL live in `user_integrations` |
| FR-IN-3 | Platform OAuth app credentials SHALL live in env only |
| FR-IN-4 | Kite SHALL remain read-only unless explicit future flag + CONFIRM flow |

---

## 5. Non-functional requirements

| NFR ID | Category | Requirement |
|--------|----------|-------------|
| NFR-1 | Availability | Single replica with watchdog restart; `/health` liveness |
| NFR-2 | Latency | Typing indicator during turn; target <30s p95 for simple turns |
| NFR-3 | Security | Service role only; mask Telegram ids in production logs |
| NFR-4 | Privacy | No cross-user data in prompts |
| NFR-5 | Observability | Structured JSON logs with module + update_id |
| NFR-6 | Deployability | Docker + Railway; webhook mode for production |

---

## 6. UX principles

1. **One voice** — never mention specialists or routing.
2. **Plain language** — no command vocabulary beyond `/start` and `/help`.
3. **Confirm destructive actions** — calendar delete requires prior read.
4. **No filler** — Morning Brief omits empty LifeOS sections.
5. **HTML replies** — markdown-ish input converted to Telegram HTML.

---

## 7. Out of scope (this PRD)

- Web UI
- Order placement on Kite
- Bank transaction import
- Multi-language support
- Group Telegram chats

---

## 8. Open questions

| # | Question | Decision needed by |
|---|----------|-------------------|
| Q1 | Auto-allowlist default in production? | Operator — recommend `false` |
| Q2 | Wire LifeOS writers vs stop reading empty tables? | Product + eng — see review doc |
| Q3 | When does Happiness get list recommendation tool? | After schema work in TODO doc |

---

## 9. Related documents

- `docs/product/BRD.md` — business context
- `docs/product/TRD.md` — technical specs
- `docs/AGENT_ROSTER.md` — agent prompts and scope
- `magnus.md` — operational truth
