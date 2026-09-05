# Connection Smoke Matrix — PR #100 Gate

**Purpose:** Agenda #5 — prove every integration is live and usable.  
**Master plan:** [`V1_HARDENING_PLAN.md`](./V1_HARDENING_PLAN.md)  
**Run on:** Owner provisioned Telegram account after PRs #91–#99 merged.

---

## Instructions

1. Use **owner** account (`scripts/provision-owner-user.mts` or existing provision).
2. For each row: **Connect** → **Chat action** → **Verify** API/DB/metadata.
3. Mark cell: ☐ pending · ✅ pass · ❌ fail · ⏭ skip (not configured)
4. Log failures in [`V1_HARDENING_LOG.md`](./V1_HARDENING_LOG.md) bug table.
5. All **Required** rows must be ✅ before PR #100 merges.

---

## Core infrastructure (Required)

| # | Connection | Connect / boot | Chat or HTTP action | Verify | Status | PR fixed |
|---|------------|----------------|---------------------|--------|--------|----------|
| C1 | Telegram | Bot token in env | Send any message → one reply | `magnus_chat_messages` 2 rows | ☐ | |
| C2 | Supabase | `SUPABASE_*` in env | Any turn persists chat | Row in DB with metadata | ☐ | |
| C3 | Redis | `UPSTASH_*` in env | Rate limit or dedupe | No double reply on retry | ☐ | |
| C4 | Anthropic | `ANTHROPIC_API_KEY` | Non-command message | Classifier + agent reply | ☐ | |
| C5 | Health HTTP | Deploy / local | `GET /health`, `GET /ready` | 200; ready checks deps | ☐ | |

---

## Per-user OAuth integrations

| # | Connection | Connect (chat) | Chat action | Verify | Required | Status | PR fixed |
|---|------------|----------------|-------------|--------|----------|--------|----------|
| I1 | Google Calendar + YouTube | `connect google` | `read_calendar` this week | Events returned; token in `user_integrations` | Yes | ☐ | |
| I2 | Google Calendar write | (same OAuth) | `schedule dentist Tuesday 3pm` | Event in Calendar API + confirmation | Yes | ☐ | |
| I3 | Calendar ↔ event log | — | Delete calendar event linked to log | `magnus_events` row synced | Yes | ☐ | |
| I4 | YouTube search | (same OAuth) | `search YouTube for jazz` | Results / links in reply | Yes | ☐ | |
| I5 | YouTube playlist | — | `add to wisdom playlist` | Playlist updated; alias in `magnus_youtube_state` | Yes | ☐ | |
| I6 | Notion | `connect notion` → `setup notion` | `log_note: test` | Supabase row + Notion page if configured | Yes | ☐ | |
| I7 | Notion lists | — | `add Dune to watchlist` + Notion sync | Supabase + Notion mirror | If Notion connected | ☐ | |
| I8 | Hevy | `upsert-user-integrations.mts` | Fitness turn: `review my last workout` | Hevy sets in prompt context | Yes | ☐ | |
| I9 | Hevy write | — | `hevy workout: ...` | Workout in Hevy app | If Hevy connected | ☐ | |
| I10 | Zerodha Kite | `connect zerodha` | `show my portfolio` | Holdings in wealth reply; read-only | Optional | ☐ | |

---

## LifeOS & lists (Required for v1 close)

| # | Connection | Action | Verify | Status | PR fixed |
|---|------------|--------|--------|--------|----------|
| L1 | Joy tank | `log joy tank 65` | Row written; appears in next turn memory | ☐ | |
| L2 | Pillar status | `health pillar at_risk` | `pillar_status` updated | ☐ | |
| L3 | Goals | `add goal: save 10L by 2028` | `goals` row; `list_lifeos_goals` | ☐ | |
| L4 | Daily check-in | `log daily check-in` | checkins list + LifeOS dual-write | ☐ | |
| L5 | Watchlist | `add Inception to watchlist` | `list_items` returns item | ☐ | |
| L6 | Recommend | `recommend from my watchlist` | Filtered pick from saved items | ☐ | |
| L7 | LifeOS memory | Enable `MAGNUS_LIFEOS_CONTEXT_ENABLED=true` | Next turn references joy/goals | ☐ | |

---

## Health loop (Required)

| # | Flow | Action | Verify | Status | PR fixed |
|---|------|--------|--------|--------|----------|
| H1 | Meal log NL | `I'm having chicken and rice` | `meal_logs` row; today totals | ☐ | |
| H2 | Meal photo | Send food photo | Logged with macros | ☐ | |
| H3 | Meal undo | `undo this` after log | Soft-deleted; totals updated | ☐ | |
| H4 | Meal plan | `plan my meals for the week` → lock | `meal_plan_entries` locked | ☐ | |
| H5 | Plan vs log | `I'll eat pasta tomorrow` | Routes to plan, NOT log | ☐ | |
| H6 | Gym + Hevy | Log gym event → train → reconcile job | Event `done` or single nudge | ☐ | |
| H7 | Health journal | EOD journal turn | Distinct from `log_note` | ☐ | |

---

## Projects (Required)

| # | Flow | Action | Verify | Status | PR fixed |
|---|------|--------|--------|--------|----------|
| P1 | Project setup | `planning Bali in April` → lock | `projects` + checklist + milestones | ☐ | |
| P2 | Project status | `how's Bali planning?` | Synthesis with checklist items | ☐ | |
| P3 | Project complete | `Bali is booked` | Status `completed`; nudges stop | ☐ | |
| P4 | Conflict | 3 active projects | `project_conflict_review` or inline ask | ☐ | |
| P5 | No hijack | Mid project setup → `log lunch` | Meal logs; setup not broken | ☐ | |

---

## Proactive (Required)

| # | Kind | Trigger | Verify | Status | PR fixed |
|---|------|---------|--------|--------|----------|
| R1 | morning_brief | Cron or `morning brief` | Automated message; win loop arms | ☐ | |
| R2 | event_reminder | `log_event` with `remind_at` | Reminder sent; `reminded_at` set | ☐ | |
| R3 | evening_journal | Enable + local hour | LLM-gated send; quiet hours respected | ☐ | |
| R4 | custom_reminder | `remind me in 30 minutes to X` | Fires at parsed time | ☐ | |
| R5 | week_planning | Monday ~8:00 local | Subscription send | ☐ | |
| R6 | weekly_wrap | Friday ~18:00 local | Includes nutrition slice | ☐ | |
| R7 | custom_reminder interval | `remind me every 2 days at 9am until Aug 31 to X` | Fires on cadence (not daily); stops after until | ☐ | #99 |
| R8 | custom_reminder replace | Correct an existing reminder cadence in chat | Prior sub disabled; no duplicate fire same window | ☐ | #99 |

---

## Voice & trust (Required)

| # | Check | Action | Verify | Status | PR fixed |
|---|-------|--------|--------|--------|----------|
| V1 | Single voice | Any pillar turn | No "Health bot" language | ☐ | |
| V2 | Action ledger | Successful list add | `metadata.action_ledger` with ok=true | ☐ | |
| V3 | No false save | Broken integration add | Honest failure, not "saved" | ☐ | |
| V4 | Compound ask | Hevy + check-in | One composed reply | ☐ | |

---

## Summary

| Category | Total | Pass | Fail | Skip |
|----------|-------|------|------|------|
| Core | 5 | | | |
| Integrations | 10 | | | |
| LifeOS & lists | 7 | | | |
| Health | 7 | | | |
| Projects | 5 | | | |
| Proactive | 6 | | | |
| Voice & trust | 4 | | | |
| **Total** | **44** | | | |

**PR #100 merge allowed when:** All Required rows ✅; failures documented as v2 deferrals with owner sign-off.

---

**Last updated:** 2026-08-16
