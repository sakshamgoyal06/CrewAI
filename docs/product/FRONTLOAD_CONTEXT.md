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
| **Active work** | `projects`, `magnus_events` | project status questions; gym today |
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
| Growth-aligned leisure | "watch a movie" at 21:00 after 3 gym misses | `growth.kpis.gym_miss_streak_days` + `growth.local_time.is_late_evening` + `growth.behavior` |
| Today's win | cross-pillar ask vs morning intention | `growth.today_win.morning_intention` |
| List-backed media | "add to watchlist" / recommend from saved | `growth.lists` + `growth.list_highlights` |

See `src/capabilities/chatMessageTestAnalysis.ts` (`PRODUCTION_ISSUE_FINDINGS`) and `docs/product/MAGNUS_IDEAS.md`.

---

## Growth snapshot (`growth`)

Loaded in parallel with other routing blocks via `loadGrowthSnapshot()`:

| Field | Source | Example use |
|-------|--------|-------------|
| `local_time` | user timezone | `is_late_evening` after 21:00 — favor sleep/recovery when gym is slipping |
| `lists` / `list_highlights` | `magnus_user_lists` + open items | watchlist/readlist/tasks catalog for media and task routing |
| `goals` | `goals` table (when LifeOS enabled) | active north-star / weekly goals |
| `today_win` | checkins + Redis win FSM | morning intention, energy, pending win confirmation |
| `behavior.narrative_bullets` | program learnings, `magnus_daily_logs`, semantic facts | "tired 3 days", "loved movie yesterday", gym trouble |
| `kpis.joy_tank` | `happiness_reserve` or checkin Joy Score | low joy → HAPPINESS refill is valid |
| `kpis.activity_stats` | `magnus_event_activity_stats` view | show-up rate per activity (gym, etc.) |
| `kpis.gym_miss_streak_days` | recent `magnus_events` misses | "missing gym 3 days" coaching signal |
| `kpis.routine_consistency_hint` | derived from stats + misses | one-line consistency nudge for classifier/execution |

**Example:** User sends "I want to watch a movie today" at 22:00. Classifier may still route HAPPINESS or GENERAL (watchlist), but `growth` tells execution: gym missed 3 days, today's win was "gym before work", late evening → suggest relaxing and sleeping so they can show up tomorrow (not guilt — Joy is a tank to protect).

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
