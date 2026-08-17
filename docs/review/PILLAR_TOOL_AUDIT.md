# Pillar Tool Audit — Every Capability & Tool

**Purpose:** Agenda #2 — audit every tool and flow against 4-pillar philosophy.  
**Master plan:** [`V1_HARDENING_PLAN.md`](./V1_HARDENING_PLAN.md)  
**Gate B:** Update **Status** and **Verified PR** for every row touched by your PR.

### Status values

| Status | Meaning |
|--------|---------|
| `pending` | Not yet manually reviewed |
| `audited` | Reviewed; behavior matches pillar + layer |
| `gap` | Known issue; fix planned (note PR) |
| `deprecated` | Intentional alias or legacy; documented |

### Columns

- **Pillar:** Primary domain owner (Health / Wealth / Wisdom / Joy / Cross)
- **Layer:** Operations / Goals / Projects
- **Executor:** Who runs it (Magnus tools / Health executor / prompt-only)

---

## A. Magnus tools (`magnusAgent.ts`)

| Tool | GENERAL capability | Pillar | Layer | Executor | Status | Verified PR | Notes |
|------|-------------------|--------|-------|----------|--------|-------------|-------|
| `read_calendar` | calendar | Cross | Operations | Magnus tools | pending | | |
| `create_calendar_event` | calendar | Cross | Operations | Magnus tools | pending | | Read-before-write |
| `update_calendar_event` | calendar | Cross | Operations | Magnus tools | pending | | |
| `delete_calendar_event` | calendar | Cross | Operations | Magnus tools | pending | | Syncs event log |
| `connect_google` | calendar, youtube | Cross | Operations | Magnus tools | pending | | Alias OAuth |
| `connect_calendar` | calendar | Cross | Operations | Magnus tools | pending | | Alias |
| `connect_youtube` | youtube | Joy | Operations | Magnus tools | pending | | Alias |
| `log_event` | event_log | Cross | Operations | Magnus tools | pending | | |
| `update_event` | event_log | Cross | Operations | Magnus tools | pending | | |
| `reschedule_event` | event_log | Cross | Operations | Magnus tools | pending | | Chain rows |
| `list_events` | event_log | Cross | Operations | Magnus tools | pending | | |
| `log_note` | journal_note | Cross | Operations | Magnus tools | pending | | ≠ health journal |
| `youtube_search` | youtube | Joy | Operations | Magnus tools | pending | | |
| `youtube_recommend` | youtube | Joy | Operations | Magnus tools | pending | | |
| `youtube_playlist` | youtube | Joy | Operations | Magnus tools | pending | | Pillar aliases |
| `youtube_bookmark` | youtube | Joy | Operations | Magnus tools | pending | | |
| `youtube_cue` | youtube | Joy | Operations | Magnus tools | pending | | |
| `list_catalog` | lists | Cross | Operations | Magnus tools | pending | | |
| `list_items` | lists | Cross | Operations | Magnus tools | pending | | |
| `lookup_list_item` | lists | Cross | Operations | Magnus tools | pending | | |
| `add_list_item` | lists | Joy* | Operations | Magnus tools | pending | | *pillar by list slug |
| `update_list_item` | lists | Cross | Operations | Magnus tools | pending | | |
| `create_list` | lists | Cross | Operations | Magnus tools | pending | | |
| `link_notion_list` | lists | Cross | Operations | Magnus tools | pending | | |
| `recommend_list_items` | lists | Joy | Operations | Magnus tools | pending | | Schema gap |
| `list_notion_items` | lists | Cross | Operations | Magnus tools | pending | | |
| `add_notion_item` | lists | Cross | Operations | Magnus tools | pending | | |
| `update_notion_item` | lists | Cross | Operations | Magnus tools | pending | | |
| `add_goal` | lists, goal_manage | Cross | Goals | Magnus tools | pending | | Dual-write |
| `add_notion_goal` | lists | Cross | Goals | Magnus tools | pending | | |
| `update_pillar_status` | lifeos | Cross | Operations | Magnus tools | pending | | Balance signal |
| `log_joy_tank` | lifeos | Joy | Operations | Magnus tools | pending | | Protected, not optimised |
| `list_lifeos_goals` | lifeos, goal_manage | Cross | Goals | Magnus tools | pending | | |
| `get_daily_checkin` | lifeos | Cross | Operations | Magnus tools | pending | | |
| `log_daily_checkin` | lifeos | Cross | Operations | Magnus tools | pending | | Dual-write checkins |
| `connect_notion` | notion | Cross | Operations | Magnus tools | pending | | |
| `sync_notion` | notion | Cross | Operations | Magnus tools | pending | | |
| `setup_notion` | notion | Cross | Operations | Magnus tools | pending | | Provision hub |
| `connect_zerodha` | zerodha_connect | Wealth | Operations | Magnus tools | pending | | |
| `connect_kite` | zerodha_connect | Wealth | Operations | Magnus tools | pending | | Alias |
| `manage_proactive_messages` | proactive | Cross | Operations | Magnus tools | pending | | |

---

## B. GENERAL capabilities (no direct tool — executor path)

| Capability | Pillar | Layer | Executor | Status | Verified PR | Notes |
|------------|--------|-------|----------|--------|-------------|-------|
| `pillar_consultation` | Cross | Operations | Magnus + pillar steps | pending | | Compound asks |
| `day_overview` | Cross | Operations | `dayOverview.ts` | pending | | Calendar+events+meals |
| `conversation` | Cross | — | Magnus prompt only | pending | | |
| `project_setup` | Cross | Projects | `projectSetupFlow` FSM | pending | | |
| `project_manage` | Cross | Projects | project executor | pending | | |
| `project_status` | Cross | Projects | project executor | pending | | |
| `goal_manage` | Cross | Goals | Magnus tools | pending | | ≠ project_setup |

---

## C. HEALTH capabilities (`healthCatalog.ts`)

| Capability | Pillar | Layer | Executor | Status | Verified PR | Notes |
|------------|--------|-------|----------|--------|-------------|-------|
| `meal_log` | Health | Operations | meal pipeline | pending | | Only kcal source |
| `meal_log_photo` | Health | Operations | vision + pipeline | pending | | |
| `meal_log_correct` | Health | Operations | correction flow | pending | | |
| `meal_history` | Health | Operations | mealHistoryAgent | pending | | |
| `meal_history_undo` | Health | Operations | reversible action | pending | | |
| `meal_breakdown` | Health | Operations | deterministic | pending | | |
| `meal_day_breakdown` | Health | Operations | deterministic | pending | | No LLM math |
| `meal_targets_show` | Health | Operations | mealTargetAgent | pending | | |
| `meal_targets_set` | Health | Operations | mealTargetAgent | pending | | |
| `meal_plan_create` | Health | Operations | mealPlanningAgent | pending | | No kcal |
| `meal_plan_read` | Health | Operations | mealPlanReadAgent | pending | | |
| `meal_plan_skip` | Health | Operations | plan store | pending | | |
| `meal_plan_swap` | Health | Operations | plan store | pending | | |
| `meal_plan_copy_week` | Health | Operations | plan store | pending | | |
| `meal_plan_template_save` | Health | Operations | template store | pending | | |
| `meal_plan_template_apply` | Health | Operations | template store | pending | | |
| `meal_plan_templates_list` | Health | Operations | template store | pending | | |
| `meal_plan_shopping_list` | Health | Operations | shoppingList | pending | | |
| `journal` | Health | Operations | healthJournalAgent | pending | | ≠ log_note |
| `hevy_write` | Health | Operations | hevyWriteAgent | pending | | Explicit prefix |
| `fitness` | Health | Operations | fitnessAgent + Hevy | pending | | |
| `alternates` | Health | Operations | alternatesAgent | pending | | |
| `nutrition_advice` | Health | Operations | nutritionAgent | pending | | No log |
| `energy` | Health | Operations | energyAgent | pending | | |
| `long_term_planning` | Health | Projects | longTermAgent | pending | | Season arcs |
| `generic_ack` | Health | — | fallback | pending | | Minimize use |

---

## D. WEALTH capabilities

| Capability | Pillar | Layer | Executor | Status | Verified PR | Notes |
|------------|--------|-------|----------|--------|-------------|-------|
| `kite_connect` | Wealth | Operations | kiteConnectTool | pending | | |
| `coaching` | Wealth | Goals | wealthAgent + Kite ctx | pending | | Read-only portfolio |

---

## E. JOY capabilities (`HAPPINESS`)

| Capability | Pillar | Layer | Executor | Status | Verified PR | Notes |
|------------|--------|-------|----------|--------|-------------|-------|
| `recommendations` | Joy | Operations | happinessAgent | pending | | Should use lists when relevant |
| `travel_rest` | Joy | Operations | happinessAgent | pending | | |
| `relationships` | Joy | Operations | happinessAgent | pending | | |
| `creative_practice` | Joy | Operations | happinessAgent | pending | | |
| `coaching` | Joy | Operations | happinessAgent | pending | | Fallback |

---

## F. WISDOM capabilities

| Capability | Pillar | Layer | Executor | Status | Verified PR | Notes |
|------------|--------|-------|----------|--------|-------------|-------|
| `learning_plan` | Wisdom | Goals | wisdomAgent | pending | | |
| `career_direction` | Wisdom | Goals | wisdomAgent | pending | | |
| `project_shipping` | Wisdom | Projects | wisdomAgent | pending | | Inside project context |
| `skill_practice` | Wisdom | Operations | wisdomAgent | pending | | |
| `coaching` | Wisdom | — | wisdomAgent | pending | | Fallback |

---

## G. Proactive kinds

| Kind | Primary pillar | Layer | Status | Verified PR | Notes |
|------|----------------|-------|--------|-------------|-------|
| `morning_brief` | Cross | Operations | pending | | Job not in kinds registry |
| `event_reminder` | Cross | Operations | pending | | |
| `gym_hevy_reconcile` | Health | Operations | pending | | Cron job |
| `nutrition_nightly` | Health | Operations | pending | | Cron job |
| `evening_journal` | Cross | Operations | pending | | LLM gated |
| `week_planning` | Cross | Operations | pending | | |
| `weekly_wrap` | Cross | Operations | pending | | |
| `monthly_goal_review` | Cross | Goals | pending | | |
| `midday_encouragement` | Cross | Operations | pending | | |
| `drift_guard` | Cross | Operations | pending | | Commitment drift |
| `stale_list_nudge` | Joy | Operations | pending | | Opt-in |
| `chat_inactivity` | Cross | Operations | pending | | Opt-in |
| `meal_log_reminder` | Health | Operations | pending | | |
| `meal_adherence_nudge` | Health | Operations | pending | | |
| `meal_eod_reconciliation` | Health | Operations | pending | | |
| `meal_gap_nudge` | Health | Operations | pending | | |
| `weekly_nutrition_review` | Health | Operations | pending | | |
| `custom_reminder` | Cross | Operations | **gap** | #99 | Daily only today; needs interval + until + replace-on-correct (coriander Aug 2026) |
| `project_conflict_review` | Cross | Projects | pending | | |

---

## H. Standard list slugs → pillar mapping

| Slug | Archetype | Primary pillar | Status | Verified PR |
|------|-----------|----------------|--------|-------------|
| watchlist | media_queue | Joy | pending | |
| readlist | reading_queue | Joy | pending | |
| travel | place_queue | Joy | pending | |
| food | food_queue | Joy | pending | |
| music | music_queue | Joy | pending | |
| experiences | experience_queue | Joy | pending | |
| tasks | task_queue | Cross | pending | |
| goals | goal_queue | Cross | pending | |
| patterns | pattern_log | Cross | pending | |
| checkins | checkin_log | Cross | pending | |

---

## Audit progress

| Section | Total rows | Audited | Gap | Pending |
|---------|------------|---------|-----|---------|
| A. Magnus tools | 38 | 0 | 0 | 38 |
| B. GENERAL caps | 7 | 0 | 0 | 7 |
| C. HEALTH caps | 25 | 0 | 0 | 25 |
| D. WEALTH | 2 | 0 | 0 | 2 |
| E. JOY | 5 | 0 | 0 | 5 |
| F. WISDOM | 5 | 0 | 0 | 5 |
| G. Proactive | 19 | 0 | 0 | 19 |
| H. Lists | 10 | 0 | 0 | 10 |
| **Total** | **111** | **0** | **0** | **111** |

**v1 close target (PR #98–#99):** 100% `audited` or `deprecated`; all `gap` rows have fix PR or v2 deferral.

---

**Last updated:** 2026-08-16
