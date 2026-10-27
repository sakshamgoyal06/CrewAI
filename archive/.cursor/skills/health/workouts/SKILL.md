---
name: workouts
description: Workouts department entry — programming coach alias aligned with fitnessAgent and workoutsCoachAgent. Use when architecture naming matters or healthRouter workouts department is the target.
disable-model-invocation: true
paths: "src/pillars/health/workouts/agents/workoutsCoachAgent.ts,src/pillars/health/workouts/agents/fitnessAgent.ts"
---

# Workouts department

Thin **department label** for the same coaching lane as **`/fitness`**.

## Canonical code

- `src/pillars/health/workouts/agents/workoutsCoachAgent.ts` → `runWorkoutsCoachAgent` → `tryFitnessAgent`
- `src/pillars/health/workouts/agents/fitnessAgent.ts`

## When to use

- User says "workouts department" or `/workouts` intent
- Refactoring health router to name Workouts explicitly

## Otherwise

Delegate to **`/fitness`** for coaching content or **`/hevy`** for API writes.

Load **`.cursor/skills/health/references/user-context.md`** for program memory.
