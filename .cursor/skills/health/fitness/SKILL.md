---
name: fitness
description: Magnus fitness and training coach. Use for gym plans, workout questions, program review, and read-only Hevy/Supabase session context. Invoke from /health or directly for training topics.
disable-model-invocation: true
paths: "src/pillars/health/workouts/**,src/agents/health/healthSubIntent.ts,src/agents/health/fitnessAgent.ts"
---

# Fitness specialist

## Load first

1. `.cursor/skills/health/references/user-context.md` (program, goals)
2. `.cursor/skills/health/references/program-learnings.md` and recent `references/journal/*.md`
3. `src/pillars/health/workouts/agents/fitnessAgent.ts` — `FITNESS_SYSTEM`, `tryFitnessAgent`
3. `src/agents/health/healthSubIntent.ts` — keyword + sub-classifier

## Scope

- Workouts, training, movement, performance
- **Read-only** Hevy context when `HEVY_API_KEY` is set
- Adapt to stated energy and schedule; no medical claims

## Hevy writes

You cannot call Hevy create APIs from this skill. For routine/workout writes, hand off to **`/hevy`** with `hevy routine:` / `hevy workout:` prefixes.

## Code changes

- Prefer `src/pillars/health/workouts/agents/`
- Tests: `fitnessAgent.test.ts`, `healthRouter.test.ts`
- Run `npm test -- src/pillars/health/workouts/agents/fitnessAgent.test.ts`
