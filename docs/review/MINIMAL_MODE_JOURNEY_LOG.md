# Minimal mode journey log — Phase A

**Review plan:** [`MINIMAL_MODE_JOURNEY_REVIEW_PLAN.md`](./MINIMAL_MODE_JOURNEY_REVIEW_PLAN.md)

---

## Session A1 — Stage 0: Process boot (in progress)

**Started:** 2026-09-12

### Trace confirmed

- **Entry:** `src/index.ts` → `createMagnus().start()` → `scheduleProactiveCron()`
- **Boot order:** dotenv → clients → capability log → Telegram runtime → health HTTP → watchdog
- **Minimal fence:** `proactive/registry.ts` wraps jobs with `isMinimalProactiveJobEnabled(job.id)`

### Files reviewed

- [x] `index.ts` — clean boot spine; proactive cron starts before Telegram (line 19–20 before main)
- [x] `magnus.ts` `createMagnus()` — only schedules proactive cron
- [x] `config/minimalMode.ts` — `MINIMAL_PROACTIVE_JOBS` lists 6 live jobs
- [x] `proactive/registry.ts` — `nutrition_nightly` gated off in minimal mode
- [ ] `config/magnusCapabilities.ts` — pending
- [ ] `healthServer.ts` — pending
- [ ] `tools/clients.ts` — pending
- [ ] `proactive/cron.ts` — pending

### Issues found

| ID | Severity | File:line | Issue | Proposed fix |
|----|----------|-----------|-------|--------------|
| — | — | — | — | — |

### Exit criteria (Stage 0)

- [ ] `npm run telegram:check` shows minimal scope
- [ ] Cron lists only `MINIMAL_PROACTIVE_JOBS` when `MAGNUS_MINIMAL_MODE=true`
