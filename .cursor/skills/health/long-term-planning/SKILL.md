---
name: long-term-planning
description: Season plans, race prep, and multi-month health or training arcs. Magnus longTermHealthPlanningAgent. Telegram /longhealth.
disable-model-invocation: true
paths: "src/agents/health/longTermHealthPlanningAgent.ts"
---

# Long-term health planning

## Load first

1. `.cursor/skills/health/references/user-context.md` — Goals, Long-term sections
2. `src/agents/health/longTermHealthPlanningAgent.ts` — `LONG_TERM_HEALTH_PLANNING_SYSTEM`

## Scope

- Seasons, quarters, race prep, habit arcs over months
- Department: **long_term_health_planning** (`slashCommands.ts` → `/longhealth`)

## Tests

`npm test -- src/agents/health/longTermHealthPlanningAgent.test.ts`

## After planning sessions

Update **`user-context.md`** with season targets and key dates.
