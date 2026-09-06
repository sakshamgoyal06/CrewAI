# Pillar Context Map — Required Memory Per Intent

**Purpose:** Ensure every conversation surfaces the right pillar context (Agenda #3).  
**Master plan:** [`V1_HARDENING_PLAN.md`](./V1_HARDENING_PLAN.md)  
**Verify in:** `src/agents/memory/memoryAgent.ts`, `memoryPackage.ts`, `selectContextSlice.ts`, `userKnowledge.ts`, `memoryTopicCommands.ts`, `buildAgentMessages.ts`, `buildStepAgentContext.ts`

**Gate C (every PR):** For each intent touched by your PR, confirm the rows below are loaded and update the **Verified** column.

---

## How to verify

1. Send a representative message for the intent on the **owner** Telegram account.
2. Inspect what reaches the agent:
   - Read `buildStepAgentContext.ts` / memory formatters for the code path, **or**
   - Add temporary debug logging (remove before merge), **or**
   - Inspect integration test fixtures that assert memory package shape (`memoryContextContract.test.ts`).
3. Mark **Verified** with PR number and date when all **Required** rows are present.
4. Mark **Optional** rows: document if missing and whether that is acceptable.

---

## GENERAL (Magnus chief of staff)

### Full Magnus (`MAGNUS_MINIMAL_MODE=false`)

| Context block | Source | Required | Loaded by | Verified |
|---------------|--------|----------|-----------|----------|
| Recent chat window | `magnus_chat_messages` | Yes | `memoryAgent` + `buildAgentMessages` | |
| Rolling summary | `memory_summaries` (rolling) | Yes | `summaryBuffer` / `memoryPackage` | |
| Memory topic index | `memory_topics` | Yes (index in prompt) | `memoryPackage` | |
| Legacy semantic facts | `memory_summaries` (`period=semantic_facts`) | If topics disabled | `semanticMemory` | |
| User profile (name, TZ, north star) | `user_profile` | Yes | `memoryAgent` | |
| Integration connectivity flags | `user_integrations` | Yes | `userKnowledge` | |
| Active projects (≤3) | `projects` + `userKnowledge` | Yes | `userKnowledge` | |
| Pillar status snapshot | `pillar_status` | Yes | LifeOS read / `userKnowledge` | |
| Today's event log commitments | `magnus_events` | Yes | `memoryAgent` / day builders | |
| Planned meals (not logged kcal) | `meal_plan_entries` | Yes | `dayOverview` / memory | |
| Calendar connectivity | `user_integrations` | Yes | `userKnowledge` | |
| List catalog + open highlights | `magnus_user_lists` | Yes | `listMemory` / `userKnowledge` | |
| Joy tank (for cross-pillar tone) | `happiness_reserve` | Optional | LifeOS read | |
| Goals (north star context) | `goals` | Optional | LifeOS read | |

**Representative test messages:** `what does tomorrow look like?` · `log gym 6am` · `morning brief`

---

### Minimal mode (`MAGNUS_MINIMAL_MODE=true`, default)

Context is trimmed by **`selectContextSlice`** (Step 1 accuracy plan). Calendar/list-focused GENERAL turns cap verbatim turns at 8 and structured block at 3.5KB; topic **labels only** in the memory block (`MAGNUS_MEMORY_TOPIC_INDEX_ONLY=true`).

| Context block | Source | Required (minimal) | Loaded by | Verified |
|---------------|--------|--------------------|-----------|----------|
| Recent chat window (verbatim in `messages[]`) | `magnus_chat_messages` | Yes | `memoryAgent` + `buildAgentMessages` | PR #100 · 2026-09-06 |
| Rolling summary (older turns) | `memory_summaries` | Yes (except calendar/list focused) | `summaryBuffer` / `memoryPackage` | PR #100 · 2026-09-06 |
| Memory topic index (labels only) | `memory_topics` | Yes | `memoryPackage` | PR #100 · 2026-09-06 |
| User profile (name, TZ, north star) | `user_profile` | Yes | `memoryAgent` | PR #100 · 2026-09-06 |
| Integration connectivity flags | `user_integrations` | Yes | `userKnowledge` | PR #100 · 2026-09-06 |
| List catalog + open highlights | `magnus_user_lists` | Yes | `listMemory` / `userKnowledge` | PR #100 · 2026-09-06 |
| Today's event log commitments | `magnus_events` | Yes | `memoryAgent` | PR #100 · 2026-09-06 |
| Calendar / YouTube / Hevy connectivity | `user_integrations` | Yes | `userKnowledge` | PR #100 · 2026-09-06 |
| Program learnings / issues / wins | `user_program_memory` | Optional | `userKnowledge` graph | PR #100 · 2026-09-06 |
| Active projects block | `projects` | Optional (project caps **parked**) | `userKnowledge` | PR #100 · N/A parked |
| Pillar status snapshot | `pillar_status` | N/A (LifeOS off by default) | — | PR #100 · N/A |
| Planned meals | `meal_plan_entries` | N/A (meals **parked**) | — | PR #100 · N/A |
| Joy tank / goals / patterns / daily scores | LifeOS tables | N/A (trimmed by `selectContextSlice`) | — | PR #100 · N/A |

**Telegram memory commands (no model):** `remember …` · `forget …` · `what do you remember?` — `memoryTopicCommands` prelude in `magnus.ts`.

**Fixture verification:** `memoryContextContract.test.ts` (context budget ≤3.5KB on calendar turn), `selectContextSlice.test.ts`, `memoryTopics.test.ts`, `memoryTopicCommands.test.ts`.

**Representative test messages (minimal):** `what's on my calendar tomorrow?` · `add eggs to groceries list` · `what do you remember?`

---

## HEALTH

| Context block | Source | Required | Loaded by | Verified |
|---------------|--------|----------|-----------|----------|
| Recent chat window | `magnus_chat_messages` | Yes | `memoryAgent` | |
| `user_health_profile` | onboarding fields | Yes | Health executors | |
| Onboarding completed? | `onboarding_completed_at` | Yes | `healthOnboarding` gate | |
| Program memory (weekly schedule, targets) | `user_program_memory` | Yes | `loadHealthReferences` | |
| Today's meal logs | `meal_logs` | Yes | meal stores | |
| Today's / week's meal plan | `meal_plan_entries` | Yes | `mealPlanStore` | |
| Macro targets | nutrition target store | Yes | `mealTargetStore` | |
| Hevy last 5 sessions (full sets) | Hevy API | If connected | `formatHevyContext` | |
| Today's gym event (if any) | `magnus_events` | Optional | event store | |
| Health journals (recent) | `magnus_daily_logs` | Optional | `loadHealthReferences` | |
| Active HEALTH projects | `projects` | Optional | `userKnowledge` | |

**Representative test messages:** `I'm having chicken rice` · `should I train legs today?` · `plan my meals for the week`

---

## WEALTH

| Context block | Source | Required | Loaded by | Verified |
|---------------|--------|----------|-----------|----------|
| Recent chat window | `magnus_chat_messages` | Yes | `memoryAgent` | |
| Kite portfolio context | Kite API | If connected | `formatKiteContext` | |
| Wealth-related goals | `goals` | Yes | LifeOS read | |
| Active WEALTH projects | `projects` | Optional | `userKnowledge` | |
| Pillar status (wealth) | `pillar_status` | Optional | LifeOS read | |
| North star / user profile | `user_profile` | Yes | `memoryAgent` | |

**Representative test messages:** `show my portfolio` · `am I saving enough?` · `connect zerodha`

**v1 note:** Wealth is prompt-only + Kite read. No wealth-specific tools beyond connect.

---

## WISDOM

| Context block | Source | Required | Loaded by | Verified |
|---------------|--------|----------|-----------|----------|
| Recent chat window | `magnus_chat_messages` | Yes | `memoryAgent` | |
| Active WISDOM projects | `projects` | Yes | `userKnowledge` | |
| Learning / career goals | `goals` | Yes | LifeOS read | |
| Skill sprint / project milestones | `features` | Optional | project store | |
| North star | `user_profile` | Yes | `memoryAgent` | |

**Representative test messages:** `learning plan for Spanish` · `how's my job search going?` (project_status may be GENERAL) · `ship my side project`

---

## JOY (`HAPPINESS` intent)

| Context block | Source | Required | Loaded by | Verified |
|---------------|--------|----------|-----------|----------|
| Recent chat window | `magnus_chat_messages` | Yes | `memoryAgent` (purpose=pattern) | |
| Joy tank level | `happiness_reserve` | Yes | LifeOS read | |
| Joy lists (watchlist, travel, experiences, food, music) | `magnus_user_lists` | Yes | `userKnowledge` / list memory | |
| Active HAPPINESS projects | `projects` | Optional | `userKnowledge` | |
| Pillar status (happiness) | `pillar_status` | Optional | LifeOS read | |

**Representative test messages:** `recommend a film like Arrival` · `restorative weekend ideas` · `recommend from my watchlist` (may route GENERAL → lists)

---

## Cross-intent: `pillar_consultation`

When GENERAL plan step is `pillar_consultation`, load:

| Context block | Required |
|---------------|----------|
| All blocks needed for Magnus tool steps (filtered via `consultationMagnusTools.ts`) | Yes |
| All blocks for each consulted pillar (e.g. HEALTH for Hevy) | Yes |
| Active projects if message references project work | Optional |

**Representative test message:** `review my Hevy workout and log this in my daily check-in`

---

## Cross-intent: `day_overview`

| Context block | Required |
|---------------|----------|
| Google Calendar events (if connected) | Yes |
| Event log commitments for target day | Yes |
| Planned meals (separate from logged) | Yes |
| Pillar status snapshot | Yes (v1 close) |
| Active project next steps | Yes (v1 close) |

**Representative test message:** `what does my whole day look like tomorrow?`

---

## LifeOS context flag

| Setting | Behavior |
|---------|----------|
| `MAGNUS_LIFEOS_CONTEXT_ENABLED=false` (default) | LifeOS tables not read into memory — **must flip true for owner at v1 close** once data exists |
| `MAGNUS_LIFEOS_CONTEXT_ENABLED=true` | Goals, pillar_status, joy tank, patterns available to memory |

**v1 close action (PR #92 or #97):** Enable for owner; verify rows above populate.

---

## Verification summary

| Intent | All required blocks verified? | PR | Date |
|--------|------------------------------|-----|------|
| GENERAL (minimal mode) | ☑ | #100 | 2026-09-06 |
| GENERAL (full) | ☐ | | |
| HEALTH | ☐ | | |
| WEALTH | ☐ | | |
| WISDOM | ☐ | | |
| JOY (HAPPINESS) | ☐ | | |
| pillar_consultation | ☐ | | |
| day_overview | ☐ | | |

---

**Last updated:** 2026-09-06 (GENERAL minimal-mode context verified — PR #100)
