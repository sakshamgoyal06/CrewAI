# Minimal mode — focus areas and sequencing

**Version:** 1.0  
**Last updated:** 2026-09-10  
**Status:** Active — product direction while `MAGNUS_MINIMAL_MODE=true` (default in production)

---

## Why minimal mode exists

Minimal mode is not a permanent product strip-down. It is a **deliberate scope fence** so Magnus can perfect a small set of operations paths before re-enabling meals, Notion, projects, and the full four-pillar depth.

The problem we are solving in this phase:

> **Is the user sticking to their plan, or are commitments failing?**

That requires reliable **capture** (calendar, event log, reminders), **closure** (activity completion, gym ↔ Hevy, evening reflection), and **honest status** on `magnus_events` — not a holistic adherence score yet, but trustworthy per-commitment truth.

---

## Phase 1 — perfect these five (live in minimal mode)

| # | Area | What “perfect” means | Primary code |
|---|------|----------------------|--------------|
| 1 | **Workouts** | Hevy read/write, gym event log, gym ↔ Hevy reconcile, drift guard | `pillars/health/workouts/`, `gymHevyReconcile`, `drift_guard` |
| 2 | **Calendar** | Read/create/update/delete, linked `magnus_events`, read-before-write | `calendarTool`, `eventStore` |
| 3 | **Lists** | Catalog, items, add/update, recommend from saved lists | `listTool`, `lists/` |
| 4 | **Reminders** | `manage_reminders`, event `remind_at`, event-reminder cron, custom reminders | `manageRemindersTool`, `eventReminderJob` |
| 5 | **Logging** | Morning win intention, evening journal FSM, activity completion, daily log status | `src/logging/`, `winConditionPending`, proactive `evening_journal` |

Supporting (live, not a focus pillar): **YouTube**, **morning brief**, general conversation.

---

## Phase 2 — after Phase 1 is solid

| Area | Gate |
|------|------|
| **Meal logging & nutrition** | Meal plan vs log, intake parser, adherence nudges, nutrition nightly |
| **Notion / LifeOS** | Journal mirror, goals, pillar status |
| **Projects** | Setup FSM, conflict review, milestone tracking |
| **Wealth / Happiness / Wisdom depth** | Full pillar specialists and integrations |

Meals stay **parked** in minimal mode (`parked_feature_topic: meals`) until Phase 1 exit criteria are met.

---

## Plan adherence in minimal mode (what we build toward)

Minimal mode does **not** ship a single `on_track` score. It ships the **inputs** adherence reasoning needs:

| Signal | Mechanism |
|--------|-----------|
| Commitment outcomes | `magnus_events.status` via activity completion FSM, gym ↔ Hevy, missed sweep |
| Routine slippage | Growth snapshot `slippingRoutines` + `magnus_event_activity_stats` |
| Daily reflection | `dailyLogStatus` + evening journal (ritual, not success) |
| Day scorecard | `buildDayRhythmSummary` — done / missed / open counts |

A future **`PlanAdherenceSnapshot`** (cross-pillar composite) is explicitly **post–Phase 1** unless scoped as a minimal-mode-only module.

> **Reality check (2026-09-12).** None of these signals are populated in production. `evening_journal`
> has fired **0 times** in 42 days (no subscription row exists), `magnus_daily_logs` has been empty
> since 2026-08-18, and `magnus_events` holds one forward `planned` row — so `activity_completion`,
> `event_reminder` and `slippingRoutines` all compute over an empty set. Full evidence and fix order:
> [`../review/MINIMAL_MODE_EXPERIENCE_AUDIT.md`](../review/MINIMAL_MODE_EXPERIENCE_AUDIT.md).

---

## Implementation

- **Config:** `src/config/minimalMode.ts` — capability catalog, tool allowlist, proactive jobs/kinds
- **Tracker:** `magnus.md` § Minimal mode
- **Architecture:** `docs/product/ACTIVITY_TAXONOMY.md` (Operations layer = calendar, events, lists, reminders)

Set `MAGNUS_MINIMAL_MODE=false` on the host to restore full Magnus.
