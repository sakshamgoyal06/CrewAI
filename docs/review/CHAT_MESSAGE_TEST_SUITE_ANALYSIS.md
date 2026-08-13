# Chat message test suite — analysis

**Date:** 2026-08-13  
**Suite:** `src/capabilities/chatMessageTestSuite.generated.ts`  
**Command:** `npx tsx scripts/dev/analyze-chat-test-suite.mts`

---

## Suite composition

| Metric | Value |
|--------|-------|
| Total test messages | **1000** |
| From real production chats | **279** |
| From userQueryCatalog | **152** |
| Synthetic + variations | **563** |
| Adversarial edge cases | **6** |
| Messages with issue tags | **50** |
| Catalog-aligned (ideal intent) | **152** |

### By source

- **real_chat:** 279
- **catalog:** 152
- **adversarial:** 6
- **synthetic:** 92
- **variation:** 471

### Issue tags (from real chat inference)

- **multi_intent:** 14
- **undo_disambiguation:** 10
- **meal_log_tense:** 6
- **playlist_name_confusion:** 5
- **duplicate_action:** 5
- **needs_prior_turn:** 4
- **ambiguous_routing:** 3
- **calendar_not_read:** 2
- **timestamp_unavailable:** 2
- **confirmation_loop:** 1

---

## Structural routing results

| Check | Result |
|-------|--------|
| Structural pass | **1000** / 1000 |
| Structural fail | **0** |
| Youtube ∩ Magnus collisions | **0** |
| Follow-ups missing prior-turn flag | **6** |

**No structural failures.**

---

## Production conversation analysis (3 signals)

- **partial_tool_failure:** 3

---

## Documented improvement areas

### PI-001 — Present-tense meal logging rejected (high)

**Examples:** "For breakfast today, I am having 2 besan cheelas" · "I am eating a dahi aloo tikki from bistro"

**Root cause:** Meal gate requires past-tense or explicit meal: prefix; present tense triggers confirm loop or rejection

**Improvement:** Treat 'I am having/eating X' as log intent with optional confirm only for ambiguous cases

### PI-002 — Duplicate meal log on single utterance (high)

**Examples:** "I had 2 paratha, bhindi sabji, and boondi raita for lunch"

**Root cause:** Meal pipeline may double-compose or re-run log in accountability pass

**Improvement:** Idempotency key per turn; single meal_log write per user message

### PI-003 — Duplicate meal entries (burrito bowl twice) (high)

**Examples:** "You logged burrito bowl twice, i only ate one"

**Root cause:** No dedupe on semantically identical meals within short window

**Improvement:** Fuzzy dedupe before insert; surface 'looks like duplicate' prompt

### PI-004 — Meal slot / breakdown confusion (medium)

**Examples:** "Samosa and tea was in evening and not mid morning" · "Why did you change breakfast and dinner?"

**Root cause:** Meal breakdown groups by inference not user-stated meal times

**Improvement:** Store meal_slot on log; honor corrections without re-inferring slots

### PI-005 — Playlist name ambiguity (Magnus vs YT Music) (medium)

**Examples:** "Add 5 famous rock songs in my high energy workout playlist in youtube music"

**Root cause:** Multiple playlist namespaces; fuzzy name match picks wrong target

**Improvement:** Resolve playlist by source (YT Music vs Magnus) before write; confirm on ambiguity

### PI-006 — Undo / follow-up requires disambiguation (medium)

**Examples:** "Undo this." · "Yes"

**Root cause:** No durable 'last actionable turn' pointer for undo scope

**Improvement:** Track reversible actions in turn metadata; default undo to most recent write

### PI-007 — Watchlist timestamp unavailable (medium)

**Examples:** "When did i add ship of theseus to watchlist"

**Root cause:** List items lack created_at in user-facing catalog read

**Improvement:** Expose added_at from list_items or chat action ledger

### PI-008 — Treadmill watch routed to Happiness not playlist tool (medium)

**Examples:** "What should i watch for treadmill tomorrow"

**Root cause:** Classifier picks taste recommendation pillar over saved-list cue

**Improvement:** Routing hint: treadmill + watch → youtube/list recommend from saved

### PI-009 — Calendar not read when user insists (medium)

**Examples:** "Cant you check using calendar connections?" · "You are not looking at calendar"

**Root cause:** GENERAL plan may answer from memory without calling read_calendar

**Improvement:** Force calendar tool when user challenges calendar accuracy

### PI-010 — Partial YouTube save failures (low)

**Examples:** "Add while my guitar gently weeps... (Note: one or more save steps failed)"

**Root cause:** Multi-step playlist writes lack transactional rollback

**Improvement:** All-or-nothing batch; report which step failed with retry

### PI-011 — Meal plan vs day overview ambiguity (medium)

**Examples:** "Whats the plan for tomorrow?" · "I mean, what does my whole day look like tomorrow"

**Root cause:** 'plan for tomorrow' spans meal plan, gym, calendar without disambiguation

**Improvement:** Clarify or default to day_overview when calendar/events context exists

### PI-012 — Multi-intent messages partially handled (low)

**Examples:** "Add this to my calendar. And suggest the youtube video for treadmill" · "Whats the gym plan for today. And meal plan for today"

**Root cause:** Plan parser may execute first step only

**Improvement:** pillar_consultation or multi-step GENERAL plans for compound asks


---

## Regenerate

```bash
npx tsx scripts/dev/generate-chat-message-test-suite.mts
npm test -- src/capabilities/chatMessageTestSuite.test.ts
npx tsx scripts/dev/analyze-chat-test-suite.mts
```
