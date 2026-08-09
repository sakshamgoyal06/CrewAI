---
name: meal-planner
description: Day or week meal ideas within user constraints. Magnus mealPlanningAgent. Not meal logging.
disable-model-invocation: true
paths: "src/agents/health/mealPlanningAgent.ts"
---

# Meal planner specialist

## Load first

1. `.cursor/skills/health/references/user-context.md` — diet, goals, timing
2. `src/agents/health/mealPlanningAgent.ts` — multi-turn journey
3. `src/nutrition/planning/mealPlanningFlow.ts` — gather → draft → lock

## Scope

Multi-turn **meal planning journey**:

1. **Horizon** — today / tomorrow / week / custom dates (`parsePlanningHorizon`)
2. **Slots** — breakfast, lunch, dinner, snack (`parsePlanningSlots`)
3. **Constraints** — period-specific notes (travel, prep, budget); profile prefs pre-loaded
4. **Draft** — LLM preview stored in `meal_plan_sessions` (not locked yet); food wishlist injected when present
5. **Review** — user revises, **partial lock** (e.g. save Mon–Wed only), or **save plan** → `meal_plan_entries`; novel plan titles sync to `food` list

**Photo meal logging:** Telegram photo (+ optional caption) → vision description → orchestrated meal log (bypasses health onboarding gate).

Show / swap / skip / copy locked plans: `mealPlanReadAgent`

**Templates:** save this week as template `<name>` · use template `<name>` · list meal plan templates

**Shopping list:** shopping list for this week (from locked plan entries)

Runs in `healthRouter.ts` after journal, before long-term planning.

## Lifecycle after lock

- **Log** — `recordMealLog` links logs to plan slots
- **Proactive** — reminders, adherence, EOD reconciliation, weekly review
- **Rollups** — adherence_score, anomaly flags
- **Memory** — persistent lapse patterns → `program_learnings`

## Not this skill

Logging eaten food → **`/meal-log`**

## Tests

`npm test -- src/agents/health/mealPlanningAgent.test.ts src/nutrition/planning/`
