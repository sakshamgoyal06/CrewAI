# Golden-path test results — Magnus pipeline integration

**Date:** 2026-08-09  
**Suite:** `src/capabilities/magnusGoldenPath.test.ts`  
**Command:** `npm test -- src/capabilities/magnusGoldenPath.test.ts`

---

## What these tests measure (vs structural catalog)

Unlike `userQueryRouting.test.ts` (regex/hint detectors only), golden-path tests run **`runOrchestratorReply`** end-to-end with fixture LLM responses and assert:

| Check | Meaning |
|-------|---------|
| **Intent** | Classifier path resolves to expected pillar (`HEALTH`, `WEALTH`, …) |
| **Capability** | Plan parser step matches `pillar_capability` / `pillar_plan_steps[0]` |
| **Delegated agent** | Internal metadata (`HealthComposite`, `Wealth`, …) — never shown to user |
| **Tools** | For GENERAL tool asks, `tools_used` includes expected primary tool |
| **One voice** | Reply text has no specialist/routing leak phrases |
| **Non-empty reply** | User always gets a message body |

LLM is **fixture-driven** (classify + plan parser + tool choice simulated correctly). This proves **wiring, routing, context assembly, and voice guardrails** — not live Claude accuracy on natural language.

---

## Summary

| Metric | Result |
|--------|--------|
| User asks exercised | **100** |
| Golden-path tests (incl. meta) | **102** |
| **Passed** | **100 / 100** user scenarios (**102 / 102** tests) |
| **Failed** | **0** |
| Full suite after addition | **1859 passed**, 1 skipped, **0 failed** |

---

## Breakdown by intent (100 scenarios)

| Intent | Scenarios | Pass |
|--------|-----------|------|
| HEALTH | 48 | 48/48 |
| WEALTH | 10 | 10/10 |
| HAPPINESS | 13 | 13/13 |
| WISDOM | 12 | 12/12 |
| GENERAL | 17 | 17/17 |

---

## What each layer verified

| Layer | Verified in golden path? |
|-------|--------------------------|
| Allowlist / Telegram | No (orchestrator only) |
| Intent classification | Yes (fixture returns ideal intent) |
| Meal-log hard override | Yes (10 explicit `meal:` scenarios, no classifier call) |
| Plan parser → capability | Yes |
| Health sub-router / deterministic gates | Yes |
| Magnus tool loop + tool handlers | Yes (GENERAL tool scenarios) |
| Timezone on calendar tools | Yes (via magnusAgent path when tools run) |
| Pillar specialist dispatch | Yes (Wealth, Happiness, Wisdom) |
| `finalizeMagnusVoice` / compose | Compose disabled in tests (`MAGNUS_PILLAR_PLAN_COMPOSE=false`) |
| Live Anthropic routing accuracy | **No** — fixtures assume correct LLM choices |

---

## Scenario categories covered

- `health_meal_log` — deterministic meal pipeline
- `health_meal_history`, `health_meal_targets`, `health_meal_plan`
- `health_fitness`, `health_hevy_write`, `health_nutrition`, `health_alternates`, `health_energy`, `health_journal`, `health_long_term`
- `wealth` — coaching + portfolio read paths
- `happiness` — recommendations, travel, relationships, creative
- `wisdom` — learning, shipping, career, practice
- `general_calendar`, `general_day_overview`, `general_youtube`, `general_lists`, `general_lifeos`, `general_notion`, `general_event_log`, `general_proactive`, `general_journal`

Full scenario list: `src/capabilities/goldenPathScenarios.ts` (first 100 entries from `userQueryCatalog.ts`).

---

## Failed tests

**None.**

---

## Regenerate

```bash
npm test -- src/capabilities/magnusGoldenPath.test.ts
```

Optional catalog hint alignment (structural only):

```bash
npx tsx scripts/dev/validate-user-query-catalog.mts
```
