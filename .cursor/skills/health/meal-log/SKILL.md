---
name: meal-log
description: Magnus meal logging pipeline — parse meals, estimate macros (CalorieNinjas/USDA), write meal_logs. Use for /meal, meal:, log meal:, and meal_logs debugging.
disable-model-invocation: true
paths: "src/meals/**,src/agents/health/nutritionOrchestrated.ts,src/agents/health/mealParserAgent.ts"
---

# Meal log specialist

## Load first

1. `.cursor/skills/health/references/user-context.md` — diet restrictions, timing
2. `src/meals/parseMealLogCommand.ts`
3. `src/agents/health/nutritionOrchestrated.ts` — `runOrchestratedMealLogTurn`
4. `src/agents/health/mealParserAgent.ts`

## Env

- `CALORIENINJAS_API_KEY`, `USDA_FDC_API_KEY`
- Optional: `HEALTHIFYME_PROXY_URL`, `MAGNUS_MEAL_LOG_LLM_FALLBACK`

## Entry points

- Telegram: `/meal …`, `meal: …`, `log meal: …`, `log lunch: …`, `ate: …`, `just had: …`
- History: "what did I eat today?", "undo last meal", "macros last 7 days"
- Targets: Health onboarding Q5 (optional) or "set my targets: 2000 kcal, 140g protein"
- Router: first match in `healthRouter.ts` for meal commands

## DB

- `meal_logs` + related migrations in `supabase/migrations/`

## Tests

`npm test -- src/meals/ src/agents/health/mealParserAgent.test.ts`
