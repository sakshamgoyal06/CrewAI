---
name: nutrition
description: Diet, macros, protein, fasting, and hydration advice for Magnus Health. Distinct from meal logging and meal planning.
disable-model-invocation: true
paths: "src/agents/health/nutritionAgent.ts,src/agents/health/nutritionPrompt.ts,src/agents/health/model.ts"
---

# Nutrition specialist (advice)

## Load first

1. `.cursor/skills/health/references/user-context.md` — Diet, restrictions
2. `src/agents/health/nutritionAgent.ts` — `tryNutritionAgent`
3. `src/agents/health/nutritionOrchestrated.ts` — only if advice path uses orchestrated turn

## Not this skill

| Task | Use |
| ---- | --- |
| Log what I ate | `/meal-log` |
| Day/week meal ideas | `/meal-planner` |
| "Instead of X" swap | `/alternates` |

## Model

`HEALTH_SPECIALIST_MODEL` in `src/agents/health/model.ts`

## Tests

`npm test -- src/agents/health/` (nutrition-related)
