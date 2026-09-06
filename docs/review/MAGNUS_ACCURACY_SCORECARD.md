# Magnus accuracy scorecard

**Generated:** 2026-09-06 (baseline)  
**Command:** `npm run test:accuracy`  
**Plan:** [`MAGNUS_ACCURACY_PLAN.md`](./MAGNUS_ACCURACY_PLAN.md)

## Headline metrics (fixture CI — minimal mode)

| Metric | Rate | Gate | Pass |
|--------|------|------|------|
| routing@1 | 100% | 98% | ✓ |
| tool_select@1 | 100% | 95% | ✓ |
| action_integrity | 100% | 100% | ✓ |
| voice_coherence | 100% | 100% | ✓ |
| minimal_gate | 100% | 100% | ✓ |
| fault_honesty | 100% | 100% | ✓ |
| metamorphic_design | 100% | 100% | ✓ |

## Suite composition

| Layer | File | Cases | What it proves |
|-------|------|-------|----------------|
| **Accuracy suite** | `magnusAccuracySuite.test.ts` | 112 | Minimal-mode routing, tools, parked gates, metamorphic paraphrases, action integrity |
| **Golden path** | `magnusGoldenPath.test.ts` | 100 | Full catalog wiring (all pillars, fixture LLM) |
| **Catalog integrity** | `catalogIntegrity.test.ts` | 7 | Capability ↔ tool map |
| **Chat NL suite** | `chatMessageTestSuite.test.ts` | 1000 | Structural coverage + production issue tags |
| **Action integrity** | `actionIntegrity.test.ts` | 20+ | False-save blocking |

## Live eval (Step 8 — not CI yet)

Run with owner credentials when ready:

```bash
MAGNUS_ACCURACY_LIVE=1 npx tsx scripts/dev/run-accuracy-live.mts
```

Targets: routing@1 ≥ 92%, tool_select@1 ≥ 88%, action_integrity 100%.

---

Regenerate fixture scorecard: `npm run test:accuracy` (see CI log for full table).
