# What users can ask Magnus

**Purpose:** Map natural-language asks to the ideal routing path and expected output.  
**Tests:** `src/capabilities/userQueryRouting.test.ts` (157 queries, 1200+ structural checks) · `src/capabilities/catalogIntegrity.test.ts`  
**Last updated:** 2026-08-09

Magnus answers in **one voice**. The user never picks a pillar or specialist. Below: what to say, where it routes, and what you should get back.

---

## How routing works

1. **Allowlist gate** — non-provisioned users get a fixed refusal (no LLM).
2. **Intent classify** — one of `HEALTH | WEALTH | HAPPINESS | WISDOM | GENERAL`.
3. **Plan parser** (Haiku) — ordered `steps[]` from capability catalogs.
4. **Execute** — tools (GENERAL only), health sub-agents, or prompt specialists.
5. **Compose** — Haiku re-voices to Magnus tone unless terminal confirmation (OAuth link, etc.).

**Hard override:** explicit meal-log format (`meal:`, `/meal`, `log meal:`) → `HEALTH` without calling the classifier.

**Structural hints** (not overrides): YouTube actions, list/LifeOS/Notion phrases, portfolio/Hevy reads — passed to classifier in `routing_hints`.

---

## Commands (no model call)

| Input | Path | Output |
|-------|------|--------|
| `/start` | `telegram.ts` local | Welcome + how to use Magnus |
| `/help` | `telegram.ts` local | Short capability summary |

Everything else is plain language.

---

## HEALTH

| User might say | Ideal capability | Path | Expected output |
|----------------|------------------|------|-----------------|
| `meal: rice and dal` | `meal_log` | Deterministic gate → meal pipeline | Compact confirmation + today totals; say **meal breakdown** for detail |
| Send meal photo | `meal_log_photo` | Vision → meal pipeline | Same as meal log |
| `that was 200g chicken not 150` | `meal_log_correct` | Health parser → correction | Updated log confirmation |
| `what did I eat today?` | `meal_history` | `mealHistoryAgent` | Meals + macro summary for range |
| `meal breakdown` | `meal_breakdown` | After recent log | Per-item macros |
| `undo last meal` | `meal_history_undo` | Delete last `meal_logs` row | Confirmation |
| `set protein to 140g` | `meal_targets_set` | `mealTargetAgent` | Updated targets |
| `plan my meals for the week` | `meal_plan_create` | Multi-turn `mealPlanningAgent` | Gather → draft → review → save |
| `what am I eating tomorrow?` | `meal_plan_read` | `mealPlanReadAgent` | Locked plan slots (not holistic day) |
| `shopping list for this week` | `meal_plan_shopping_list` | Plan store | Grocery list from plan |
| `journal / wrap up my day` | `journal` | `healthJournalAgent` | EOD health journal prompt + save |
| `hevy routine: …` | `hevy_write` | `hevyWriteAgent` | Hevy API write result |
| `should I train legs today?` | `fitness` | `fitnessAgent` + program memory | Coaching with weekly schedule context |
| `review my last Hevy workout` | `fitness` | Fitness + Hevy read | Set-by-set session detail |
| `instead of butter what can I use?` | `alternates` | `alternatesRecommenderAgent` | Swap suggestions |
| `how much protein should I eat?` | `nutrition_advice` | `nutritionAgent` | Practical advice, no log |
| `I'm exhausted, slept 5 hours` | `energy` | `energyAgent` | Recovery framing, not diagnosis |
| `16-week marathon block` | `long_term_planning` | `longTermHealthPlanningAgent` | Periodization outline |

**Not HEALTH:** `what does my entire day look like tomorrow?` → **GENERAL** `day_overview` (calendar + commitments + meals together).

---

## WEALTH

| User might say | Ideal capability | Path | Expected output |
|----------------|------------------|------|-----------------|
| `connect zerodha` / `link kite` | `kite_connect` | `kiteConnectTool` or wealth executor | OAuth link in chat |
| `show my portfolio` / `kite holdings` | `coaching` | Wealth agent + Kite context | Holdings, MF, SIPs summary (read-only) |
| `am I saving enough?` | `coaching` | `wealthAgent` prompt | Budgeting / goals coaching |
| Investing philosophy questions | `coaching` | Wealth prompt | Principles, no order placement |

**Note:** Kite **write** (orders) is intentionally not built — see `magnus.md` Not built yet.

---

## HAPPINESS (Joy pillar)

| User might say | Ideal capability | Path | Expected output |
|----------------|------------------|------|-----------------|
| `recommend a film like Arrival` | `recommendations` | Happiness prompt | Taste-based picks (no list tool) |
| `restorative weekend ideas` | `travel_rest` | Happiness prompt | Pacing and rest ideas |
| `reconnect with an old friend` | `relationships` | Happiness prompt | Social energy, scripts |
| `pick up guitar again for fun` | `creative_practice` | Happiness prompt | Joy-focused practice |
| Mixed leisure ask | `coaching` | Happiness fallback | General leisure coaching |

**Not Happiness:** `add Inception to watchlist` → **GENERAL** `lists` (Magnus tool).

---

## WISDOM

| User might say | Ideal capability | Path | Expected output |
|----------------|------------------|------|-----------------|
| `learning plan for Spanish` | `learning_plan` | Wisdom prompt | Curriculum, milestones |
| `ship my side project` | `project_shipping` | Wisdom prompt | Scope, next step, risks |
| `promotion conversation prep` | `career_direction` | Wisdom prompt | Positioning, evidence |
| `daily practice for piano` | `skill_practice` | Wisdom prompt | Deliberate practice routine |
| Mixed growth ask | `coaching` | Wisdom fallback | General wisdom coaching |

---

## GENERAL (Magnus tools)

| User might say | Ideal capability | Tools / executor | Expected output |
|----------------|------------------|------------------|-------------------|
| `what's on my calendar tomorrow?` | `calendar` | `read_calendar` | Event list |
| `schedule dentist Tuesday 3pm` | `calendar` | read then `create_calendar_event` | Confirmation + ids |
| `what does my whole day look like?` | `day_overview` | `dayOverview.ts` | Calendar + events + planned meals |
| `search YouTube for jazz` | `youtube` | `youtube_search` | Results / links |
| `add to wisdom playlist` | `youtube` | `youtube_playlist` | Playlist update |
| `what's on my watchlist?` | `lists` | `list_items` | Items from list |
| `add Dune to readlist` | `lists` | `add_list_item` | Saved confirmation |
| `recommend from my watchlist` | `lists` | `recommend_list_items` | Filtered pick from saved items |
| `log joy tank 65` | `lifeos` | `log_joy_tank` | Tank logged |
| `health pillar at_risk` | `lifeos` | `update_pillar_status` | Status updated |
| `log daily check-in` | `lifeos` | `log_daily_checkin` | Check-in row |
| `connect notion` | `notion` | `connect_notion` | OAuth link |
| `log gym 6am tomorrow` | `event_log` | `log_event` | Commitment in event log |
| `reschedule gym to Friday` | `event_log` | `reschedule_event` | Chained replacement row |
| `remind me tomorrow 8pm` | `proactive` | `manage_proactive_messages` | Custom reminder created |
| `connect google` | `calendar` / `youtube` | `connect_google` | Unified OAuth link |
| `quick note: …` | `journal_note` | `log_note` | Note in daily log (+ Notion if linked) |
| `review my hevy workout and log this in my daily checkins` | `pillar_consultation` | Magnus tools + HEALTH step | Single composed reply |
| `what's the capital of France?` | `conversation` | Magnus prompt only | Direct answer, no tools |

---

## Proactive (Magnus initiates)

Users can also **configure** proactive messages:

- `enable evening journal` · `disable drift guard` · `list proactive messages`
- `remind me in 30 minutes to …` · `every day at 9am remind me to …`

Magnus may also send without a user turn: morning brief, event reminders, gym↔Hevy reconcile, nutrition nightly, subscription kinds (see `docs/TOOLS_AND_AGENTS.md` §7).

Manual brief: `morning brief` or legacy `/morningbrief`.

---

## Access and limits

| Condition | Result |
|-----------|--------|
| Not allowlisted | Fixed refusal, no chat rows |
| Rate limit (Redis) | Throttle message per `MAGNUS_RATE_LIMIT_PER_MINUTE` |
| Integration missing | Magnus says not connected + offers connect link |
| Turn timeout | User-facing timeout reply (`MAGNUS_TURN_TIMEOUT_MS`) |

---

## Automated test coverage

| Suite | What it verifies |
|-------|------------------|
| `userQueryRouting.test.ts` | 157 user queries × structural validators (hints, detectors, pillar consultation, meal parse) |
| `catalogIntegrity.test.ts` | Catalog ids, tool map ↔ `magnusAgent` |
| `orchestratorIntent.test.ts` | Classifier payload + meal hard override |
| `magnusActionDetect.test.ts` | List/LifeOS/Notion/event/proactive phrases |
| `healthServer.internal.test.ts` | Morning brief HTTP job auth |

Full unit suite: `npm test` (1757+ tests).

Validate catalog hints locally: `npx tsx scripts/dev/validate-user-query-catalog.mts`
