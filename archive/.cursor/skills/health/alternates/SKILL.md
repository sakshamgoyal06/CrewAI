---
name: alternates
description: Food swaps and alternates — instead of, swap, alternative to. Magnus alternatesRecommenderAgent.
disable-model-invocation: true
paths: "src/agents/health/alternatesRecommenderAgent.ts"
---

# Alternates recommender

## Load first

1. `.cursor/skills/health/references/user-context.md` — restrictions, diet style
2. `src/agents/health/alternatesRecommenderAgent.ts`

## Triggers

- "instead of", "swap", "alternative to", similar phrasing
- Routed in `healthRouter.ts` before generic nutrition

## Tests

`npm test -- src/agents/health/alternatesRecommenderAgent.test.ts`
