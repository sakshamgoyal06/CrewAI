# Magnus — Frontload Routing Context

**PR:** #92 Memory & Pillar Context Spine  
**Code:** `src/agents/context/`  
**Last updated:** 2026-08-18

---

## Purpose

Load **routing context** once per Telegram turn **before** intent classification. This fixes mis-routing seen in real chat (Aug 2–16, 2026): short follow-ups (`Yes`, `Undo this`), meal confirm loops, calendar challenges without connection, playlist continuations, and meal-plan vs holistic-day confusion.

Full execution memory still loads **after** intent (`memoryAgent` + `userKnowledge`).

---

## What loads before classify

| Block | Source | Why routing needs it |
|-------|--------|----------------------|
| **Identity** | `user_profile` / turn input | timezone, north star, health onboarding gate |
| **Integrations registry** | `user_integrations` (flags only) | calendar/kite/youtube off → don't mis-route portfolio/schedule |
| **Recent turns (8)** | `magnus_chat_messages` + metadata | `Yes` after playlist ops; tool continuation |
| **Pending state** | Redis + session tables | meal confirm, undo, project FSM, meal-plan FSM |
| **Active work** | derived from `growth` | project titles + commitment counts (no activity-specific flags) |
| **Standing context** | `user_program_memory`, semantic facts | avoid lists, meal rules (lauki, Friday burger) |
| **Growth snapshot** | lists, goals, checkins, daily logs, LifeOS KPIs | behavior narrative, today's win, joy tank, show-up rate, late-evening coaching |
| **Routing hints** | `intentRoutingHints.ts` | structural signals (holistic day, compound, meal log) |

---

## Memory structure (multi-phrase → same answer)

Three layers agents use — routing only needs layer 1:

```
┌─ Layer 1: ROUTING (frontload) ─────────────────────────────┐
│  identity · integrations · pending · recent+metadata        │
│  active work snapshot · standing rules · growth snapshot    │
│  routing_hints                                              │
└────────────────────────────────────────────────────────────┘
┌─ Layer 2: EXECUTION (after intent) ────────────────────────┐
│  verbatim chat · rolling summary · semantic facts           │
│  events · calendar · meals · lists · pillar modules         │
└────────────────────────────────────────────────────────────┘
┌─ Layer 3: TRACE (parallel) ────────────────────────────────┐
│  trace_id · action_ledger · turn metadata (future table)  │
└────────────────────────────────────────────────────────────┘
```

**Variety handling:** same intent from many phrasings via:

1. **Structural hints** (regex/signals) — cheap, deterministic  
2. **Recent turn metadata** — `tools_used`, `delegated_agent` for continuations  
3. **Pending FSM state** — not inferring from "yes" alone  
4. **Classifier** with full `routing_context` JSON — handles paraphrase  
5. **Standing facts** — durable rules extracted once, reused every turn  

Vectors/RAG (v2): fuzzy recall over old journals — not used for routing yet.

---

## Real chat patterns addressed

| Pattern | Example | Context fix |
|---------|---------|-------------|
| Tool continuation | `Yes add both` after YouTube | `recent_turns.tools_used` |
| Meal confirm | `yes` after confirm prompt | `pending.meal_log_confirm` |
| Undo | `Undo this` | prelude + `pending.reversible_undo` |
| Calendar challenge | `You aren't looking at calendar` | `integrations.googleCalendar` |
| Holistic day | `what does tomorrow look like` | `routing_hints.holistic_day_ask` + commitments count |
| Meal plan thread | `change dinner on the plan` | `pending.meal_plan_session` |
| Project setup | `lock it in` during project FSM | `pending.project_session` |
| Avoid foods | lauki in plan despite rule | `standing.program_notes` + `routing_facts` |
| Growth-aligned leisure | movie at 21:00 after routine slips | `growth.operations.slipping_routines` + `growth.day_frame.tone` |
| Today's win | cross-pillar ask vs morning intention | `growth.day_frame.morning_intention` |
| Rest vs grind | "I want to take it easy" on a working day | `growth.day_frame.tone` (working / rest / relaxed) |
| Errands | "what's on my task list" | `growth.operations.errands` |
| Project momentum | "how's the job search going" | `growth.projects` |
| List-backed media | "add to watchlist" / recommend from saved | `growth.lists` + `growth.list_highlights` |

See `src/capabilities/chatMessageTestAnalysis.ts` (`PRODUCTION_ISSUE_FINDINGS`) and `docs/product/MAGNUS_IDEAS.md`.

---

## Growth snapshot (`growth`)

Loaded via `loadGrowthSnapshot()` — **read-only assembly** from per-user stores. Nothing is gym- or activity-specific; routines group by `activity_key` on `magnus_events`.

### How data gets written (any user)

| User action | Tool / job | Store |
|-------------|------------|-------|
| "Gym tomorrow 7am" / "pay bills Friday" | `log_event` | `magnus_events` → `activity_key` slug |
| "Missed it" / "done" | `update_event` | event `status` |
| Stale planned events | `magnus_sweep_missed_events` (morning brief) | `status = missed` |
| Journal / note | `log_note` / journal tools | `magnus_daily_logs` |
| Morning intention / energy | morning brief → `log_daily_checkin` | `checkins` list (`extra` JSON) |
| North star goals | `create_goal` / LifeOS | `goals` (`timeframe`: north_star → weekly) |
| Open errands | `list_items` add on `tasks` / custom lists | `magnus_list_items` |
| Issues / wins (long-term) | health coaching, nutrition nightly | `user_program_memory.program_learnings` |
| Joy / pillar health | `log_joy_tank`, `update_pillar_status` | `happiness_reserve`, `pillar_status` |
| Show-up KPIs | automatic | view `magnus_event_activity_stats` |

### Growth blocks in routing JSON

| Block | Source | Use |
|-------|--------|-----|
| `day_frame` | checkins, `daily_plans`, `weekly_schedule`, commitments | **working / rest / relaxed** tone; morning intention, feeling, morning notes |
| `north_star` | profile + `goals` | statement + active goals by timeframe |
| `operations.today_commitments` | `magnus_events` today | what's planned; overdue flag per row |
| `operations.overdue_count` | `magnus_events` | carry-over load |
| `operations.errands` | open `tasks` / errand lists + admin events | errands and open loops |
| `operations.slipping_routines` | missed events + `activity_stats` by `activity_key` | **any** routine slipping (not gym-only) |
| `projects` | `buildActiveProjectSummaries` | active projects, open checklist, consistency hint |
| `behavior.issues` / `narrative_bullets` | program learnings, logs, semantic facts | issues faced, recent context |
| `kpis.top_routines` | `magnus_event_activity_stats` | show-up % per activity |
| `kpis.joy_tank` / `pillar_status` | LifeOS or checkins | quantified wellbeing |
| `lists` / `list_highlights` | list catalog | watchlist, readlist, tasks |

**Example:** User at 22:00 asks to watch a movie. `slipping_routines` might show `{ activityKey: "gym", recentMisses: 3 }` or `{ activityKey: "deep_work", ... }` depending on their log — same code path. `day_frame.tone: "working"` + low energy → execution favors rest without guilt.

---

## API

```typescript
const routingContext = await assembleRoutingContext({
  userProfileId,      // required — tenant key
  telegramUserId,
  userMessage,
  displayName,
  timezone,
  northStarGoal,
});

const intent = await resolveIntentNaturalLanguage(message, { routingContext });
```

Multi-user safety: every query scoped by `userProfileId`; no process-global user state.

---

## Next (PR #92 continued)

- [ ] `assembleUserContextBundle()` — execution layer after intent  
- [ ] `selectContextSlice(intent)` — pillar-specific blocks  
- [ ] Trace table `magnus_turn_events` with `routing_context` hash  
- [ ] pgvector recall (v2) for unstructured history only
