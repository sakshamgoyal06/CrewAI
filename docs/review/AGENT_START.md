# Paste this when starting a review agent

Copy the block below into a **new** Cloud Agent (on **`main`**, after `git pull`):

---

```
Magnus architecture review — Phase A Session A1.

BEFORE ANYTHING ELSE:
1. git fetch origin main && git checkout main && git pull origin main
2. Confirm: test -f docs/review/README.md && ! test -f docs/review/V1_HARDENING_PLAN.md && echo OK
3. Read docs/review/README.md then docs/review/MINIMAL_MODE_JOURNEY_REVIEW_PLAN.md

Do NOT read V1_HARDENING_PLAN.md (deleted). The only review plan is MINIMAL_MODE_JOURNEY_REVIEW_PLAN.md.

Start Session A1 — Stage 0 (process boot): review index.ts, magnus.ts createMagnus, minimalMode.ts, proactive/cron registry, healthServer boot. Log findings in docs/review/MINIMAL_MODE_JOURNEY_LOG.md.
```

---

If the agent still cites hardening docs, their checkout is stale — start a **new** agent or run step 1 above.
