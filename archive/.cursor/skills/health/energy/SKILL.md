---
name: energy
description: Sleep, HRV, fatigue, and recovery patterns for Magnus Health. Non-clinical energy specialist. Use for tiredness, sleep quality, and recovery planning.
disable-model-invocation: true
paths: "src/agents/health/energyAgent.ts"
---

# Energy & recovery specialist

## Load first

1. `.cursor/skills/health/references/recovery-routine.md` — rest/train gate, rest-day protocol
2. `.cursor/skills/health/references/user-context.md` — Recovery section
3. `src/agents/health/energyAgent.ts` — `ENERGY_SYSTEM`, `tryEnergyAgent`

## Scope

- Sleep, energy, fatigue, focus patterns
- Correlations and habits — **not** medical diagnosis
- Last in HEALTH router stack after nutrition paths

## Guardrails

- No clinical claims; encourage professional help when appropriate
- Supportive LifeOS tone

## Tests

`npm test -- src/agents/health/energyAgent.test.ts`
