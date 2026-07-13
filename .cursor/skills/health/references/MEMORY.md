# Health agent — memory routing

The **Health orchestrator** (`.cursor/agents/health.md`, invoke `/health`) loads shared context first, then pulls **specialist-specific** memory before invoking a skill.

## Always load

| File | Purpose |
| ---- | ------- |
| `.cursor/skills/health/references/user-context.md` | User goals, program, Hevy routine IDs, diet prefs — **update when durable facts change** |
| `magnus.md` | Project tracker: env vars, source paths, behaviour |
| Current chat | Ephemeral: today's session, one-off clarifications |

## Per specialist

### `/meal-log`

- `src/agents/health/nutritionOrchestrated.ts`
- `src/agents/health/mealParserAgent.ts`
- `src/meals/` (parse, estimate, record)
- `user-context.md` → **Diet** section (restrictions, timing)
- Migrations: `supabase/migrations/*meal*`

### `/meal-planner`

- `src/agents/health/mealPlannerAgent.ts`
- `user-context.md` → **Diet**, **Goals**
- Do **not** conflate with meal logging

### `/alternates`

- `src/agents/health/alternatesRecommenderAgent.ts`
- `user-context.md` → **Diet** (restrictions, swaps)

### `/nutrition`

- `src/agents/health/nutritionAgent.ts`, `nutritionPrompt.ts`
- `src/agents/health/model.ts` (`HEALTH_SPECIALIST_MODEL`)
- `user-context.md` → **Diet**, **Goals**

### `/fitness` and `/workouts`

- `src/pillars/health/workouts/agents/fitnessAgent.ts` (or deprecated shim `src/agents/health/fitnessAgent.ts`)
- `src/agents/health/healthSubIntent.ts`
- `user-context.md` → **Training program**, **Hevy** (read-only context)
- Optional Supabase: `workouts` table

### `/hevy`

- `src/pillars/health/workouts/hevy/` (client, env, parsers)
- `src/pillars/health/workouts/agents/hevyWriteAgent.ts`
- `scripts/health/workouts/hevy/` (operational scripts)
- `user-context.md` → **Hevy** section (folder id, routine ids, program rules)
- `.env` → `HEVY_API_KEY` (never commit)

### `/energy`

- `src/agents/health/energyAgent.ts`
- `user-context.md` → **Recovery**, sleep notes if any

### `/long-term-planning`

- `src/agents/health/longTermHealthPlanningAgent.ts`
- `user-context.md` → **Goals**, season / race targets

## Onboarding (runtime only)

Telegram first-time flow: `src/agents/health/healthOnboarding.ts` + `user_health_profile` table. In Cursor, capture the same fields in `user-context.md` when the user shares them.
