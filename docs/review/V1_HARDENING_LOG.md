# Magnus v1 Hardening Log

**Master plan:** [`V1_HARDENING_PLAN.md`](./V1_HARDENING_PLAN.md)  
**Update this file on every PR** (#91–#100).

---

## Session log

| Date | PR | Agent / human | Segments | Gates A–D | Summary |
|------|-----|---------------|----------|-----------|---------|
| 2026-08-16 | docs | — | Plan created | — | Initial review artifact suite pushed to `main` |
| 2026-08-17 | docs | — | PR #99 scope | — | Added segment **10.3 Reminder frequencies** (coriander incident); interval/until/replace-on-correct |
| 2026-09-05 | — | agent | routing spine | — | LLM `routingContextParser` replaces regex routing (conversationSignals, magnusActionDetect, deterministic plan bypasses) |
| 2026-09-12 | docs | agent | 10.1–10.3 audit | — | Minimal mode experience audit from 42 days of production data → [`MINIMAL_MODE_EXPERIENCE_AUDIT.md`](./MINIMAL_MODE_EXPERIENCE_AUDIT.md); bugs B-003…B-009 logged |
| 2026-08-18 | #92 | agent | 3.1 (partial) | A pass (scoped) | Generic growth snapshot: day frame, commitments, errands, projects, slipping routines by activity_key |
| 2026-08-17 | #91 / GitHub #92 | owner | 0.1–2.1 | A pass | Merged foundation PR |

---

## Milestone tracker

| PR | Title | Status | Merged date | Branch |
|----|-------|--------|-------------|--------|
| #91 | Foundation & Pillar Canon | `merged` | 2026-08-17 | `cursor/v1-pr91-foundation-9f4f` → GitHub [#92](https://github.com/sakshamgoyal06/CrewAI/pull/92) |
| #92 | Memory & Pillar Context Spine | `in_progress` | — | `cursor/v1-pr92-memory-context-9f4f` |
| #93 | Routing Spine & Voice Coherence | `pending` | — | |
| #94 | Calendar, Events, Chief-of-Staff Day | `pending` | — | |
| #95 | Health: Meals & Planning | `pending` | — | |
| #96 | Health: Training, Hevy, Nutrition | `pending` | — | |
| #97 | Joy/Wisdom: Lists, YouTube, Notion, LifeOS | `pending` | — | |
| #98 | Four-Pillar Reintegration | `pending` | — | |
| #99 | Proactive Chief of Staff & Rhythm | `pending` | — | |
| #100 | Architecture Freeze & v1 Declaration | `pending` | — | |

**Status values:** `pending` · `in_progress` · `merged` · `blocked`

---

## Segment checklist

Mark `pass` / `fail` / `skip` as each PR closes segments.

| ID | Segment | PR | Status | Notes |
|----|---------|-----|--------|-------|
| 0.1 | Boot & capabilities | #91 | pass | Owner `telegram:check` — @MagnusLifeOsBot, coreOk=true |
| 0.2 | Health HTTP / OAuth | #91 | pass | Unit tests green |
| 1.1 | Database & migrations | #91 | pass | `test:supabase` green; north_star_goal insert fix |
| 1.2 | Identity & access | #91 | pass | Owner profile + integrations verified |
| 2.1 | Telegram delivery | #91 | pass | `/start`, `/help`, delivery manual scripts |
| 3.1 | Memory subsystem | #92 | in_progress | Generic `loadGrowthSnapshot` (day frame, north star, commitments/errands, projects, slipping routines); execution bundle next |
| 4.1 | Orchestrator prelude | #92 | | |
| 4.2 | Intent + routing hints | #92 | | |
| 4.3 | Pillar strategy | #93 | | |
| 4.4 | Day overview + consultation | #93 | | |
| 5.1 | Accountability + voice | #93 | | |
| 6.1 | Calendar tools | #94 | | |
| 6.2 | Event log | #94 | | |
| 6.3 | Journal + morning brief | #94 | | |
| 7.2 | Meal logging | #95 | | |
| 7.4 | Meal planning | #95 | | |
| 7.6 | Vision / photos | #95 | | |
| 7.5 | Nutrition nightly | #96 | | |
| 7.7 | Fitness / Hevy | #96 | | |
| 7.1 | Health onboarding | #96 | | |
| 6.4 | YouTube | #97 | | |
| 6.5 | Lists | #97 | | |
| 6.6 | LifeOS tools | #97 | | |
| 6.7 | Notion | #97 | | |
| 9.1 | Projects layer | #98 | | |
| 6.8 | Kite / Wealth | #98 | | |
| 8.1–8.3 | Shallow pillars grounded | #98 | | |
| 10.1 | Proactive cron | #99 | | |
| 10.2 | Proactive kinds | #99 | | |
| 10.3 | Reminder frequencies | #99 | | Interval days, until-date, replace-on-correct (coriander) |
| 11.1 | CI + test gate | #100 | | |
| 11.2 | Seven-day owner sim | #100 | | |

---

## Bug log (during hardening)

| ID | PR | Severity | Description | Fix | Verified |
|----|-----|----------|-------------|-----|----------|
| B-001 | #99 | high | “Every 2 days” coriander water reminder stored as daily `recurring_local`; correction stacked duplicate dailies → double fire same morning | Segment 10.3: `recurring_interval`, `until`, replace-on-correct | |
| B-002 | #95 | medium | Coriander plant photo mis-routed to meal log (~11 kcal) | Segment 7.6: photo purpose ≠ meal when not food | |
| B-003 | #99 | critical | Owner profile has **no rhythm subscription rows** — `evening_journal` / `evening_log_followup` have fired **0 times** in 42 days; `magnus_daily_logs` empty since 2026-08-18. `seedDefaultRhythmSubscriptions` runs only in `provision-owner-user.mts`, no backfill | Backfill migration + boot-time reconciliation for allowlisted profiles | |
| B-004 | #99 | high | `manage_proactive_messages` excluded from `MINIMAL_MAGNUS_TOOL_NAMES` and `proactive` capability parked → user cannot enable the evening journal from chat (deadlocks B-003) | Allowlist the tool + capability in minimal mode | |
| B-005 | #99 | high | "Cancel reminders for coriander water change" failed twice (2026-08-20, 2026-09-12); `matchRemindersByQuery` matches `config.message` body, not a label. Second attempt got **no reply at all** | Store a reminder label; disambiguate on partial match; guarantee an assistant row per turn | |
| B-006 | #97 | high | 13-item todo list lost. `"todo list"` → unknown slug `todo-list`; `add_list_item` is one-per-call against `MAGNUS_MAX_TOOL_ROUNDS=12`; model reported an invented "backend hiccup" | Slug alias, batch `add_list_items`, deterministic tool-failure text | |
| B-007 | #96 | high | Journal note routed to HEALTH is unrecoverable — minimal mode filters the `journal` capability and no health executor can reach `log_note`. Reply contained both "I haven't actually saved that yet" and "I've logged that" | Route logging verbs to GENERAL; strip persistence claims when action integrity fires | |
| B-008 | #96 | medium | Natural-language Hevy routine creation refused (*"I don't have direct access to your Hevy account"*) though `createHevyRoutine` is implemented and `hevy_write` is allowlisted — `parseHevyWriteCommand` requires the literal `hevy routine:` prefix. Ignored locked `weekly_schedule` | Drop prefix requirement; forbid capability denials in the fitness prompt | |
| B-009 | #94 | medium | Morning brief read out two overlapping swim sessions (09:00 and 10:00 on 2026-09-12) as fact — `buildDayContext` has no conflict/duplicate detection | Flag overlaps and ask instead of listing both | |

---

## Baseline snapshots

### `telegram:check` (paste JSON or summary)

**CI dummy env** (cloud agent, 2026-08-16): [`baselines/telegram-check-ci-dummy-2026-08-16.json`](./baselines/telegram-check-ci-dummy-2026-08-16.json)

```
coreOk: true
ready: chat, journal, morning_brief, proactive
partial: workouts, meals, notion, access, delivery
off: zerodha, calendar, youtube
getMe: Unauthorized (dummy TELEGRAM_BOT_TOKEN — expected)
```

**Owner verified** (2026-08-17): `coreOk=true`, bot @MagnusLifeOsBot, ready: chat, journal, morning_brief, calendar, proactive.

```bash
npm run telegram:check -- --json > docs/review/baselines/telegram-check-owner-2026-08-17.json
```

### Supabase hosted baseline

[`baselines/supabase-hosted-2026-08-16.json`](./baselines/supabase-hosted-2026-08-16.json) — 59 public tables, 27 migration files.

**Owner verified:** `npm run test:supabase` green (2026-08-17); fix `north_star_goal` on profile insert in PR #92.

### Test counts at v1 start

```
PR #90 baseline:
- chatMessageTestSuite: 1000 NL messages
- userQueryCatalog: 158 queries
- golden paths: 100 scenarios
- See docs/review/AUDIT_2026-08-09.md

PR #91 segment 0.1 CI (2026-08-16):
- npm test: 2247 passed, 1 skipped (158 files)
- npm run build: pass
- PR #91 scoped tests: 22 passed (magnusCapabilities + healthServer)
```

---

## Agenda close-out (final PR #100)

| Agenda item | Closed? | Evidence |
|-------------|---------|----------|
| 1. Four-pillar reintegration | ☐ | PR #98 + audit doc |
| 2. Tool/flow pillar audit | ☐ | `PILLAR_TOOL_AUDIT.md` 100% |
| 3. Pillar context every turn | ☐ | `PILLAR_CONTEXT_MAP.md` verified |
| 4. True chief of staff | ☐ | Brief + proactive + projects |
| 5. Connection smoke test | ☐ | `CONNECTION_SMOKE_MATRIX.md` |

---

**Last updated:** 2026-09-12
