---
name: meal-planner
description: Day or week meal ideas within user constraints. Magnus mealPlannerAgent. Not meal logging.
disable-model-invocation: true
paths: "src/agents/health/mealPlannerAgent.ts"
---

# Meal planner specialist

## Load first

1. `.cursor/skills/health/references/user-context.md` — diet, goals, timing
2. `src/agents/health/mealPlannerAgent.ts` — `tryMealPlannerAgent`, `MEAL_PLANNER_SYSTEM`

## Scope

- Meal **ideas** for a day or week
- Runs early in `healthRouter.ts` (before fitness)

## Not this skill

Logging eaten food → **`/meal-log`**

## Tests

`npm test -- src/agents/health/mealPlannerAgent.test.ts`
