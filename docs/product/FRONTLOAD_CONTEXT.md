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
| **Routing hints** | `intentRoutingHints.ts` | structural signals (holistic day, compound, meal log) |

---

## Memory structure (multi-phrase → same answer)

Three layers agents use — routing only needs layer 1:

```
┌─ Layer 1: ROUTING (frontload) ─────────────────────────────┐
│  identity · integrations · pending · recent+metadata        │
│  active work snapshot · standing rules · routing_hints      │
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

See `src/capabilities/chatMessageTestAnalysis.ts` (`PRODUCTION_ISSUE_FINDINGS`) and `docs/product/MAGNUS_IDEAS.md`.

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
