# Magnus v1 Close-Out Plan — PR #91 → #100

**Status:** Active execution plan  
**Created:** 2026-08-16  
**Current PR:** #90 merged · **10 PRs remaining** to v1 complete  
**Audience:** Owner, Cloud Agents, Cursor subagents, future contributors  
**Companion docs:** This file is the **master plan**. Use the linked artifacts for day-to-day tracking.

| Artifact | Purpose |
|----------|---------|
| **[V1_HARDENING_PLAN.md](./V1_HARDENING_PLAN.md)** (this file) | Master plan, milestones, PR scope, agent instructions |
| **[V1_HARDENING_LOG.md](./V1_HARDENING_LOG.md)** | Per-segment pass/fail log — update every PR |
| **[PILLAR_TOOL_AUDIT.md](./PILLAR_TOOL_AUDIT.md)** | Every tool/capability → pillar + activity layer |
| **[PILLAR_CONTEXT_MAP.md](./PILLAR_CONTEXT_MAP.md)** | Required memory context per intent |
| **[CONNECTION_SMOKE_MATRIX.md](./CONNECTION_SMOKE_MATRIX.md)** | Integration smoke tests for PR #100 |
| **[ARCHITECTURE_COHERENCE.md](./ARCHITECTURE_COHERENCE.md)** | Frozen architecture target + streamlining rules |
| **[MAGNUS_IDEAS.md](../product/MAGNUS_IDEAS.md)** | Product ideas backlog (post–v1 only — not hardening) |

**Operational tracker:** [`magnus.md`](../../magnus.md) · **Version canon:** [`docs/product/MAGNUS_VERSIONS.md`](../product/MAGNUS_VERSIONS.md)

---

## 1. North star

After **PR #100**, Magnus v1 is **complete**:

> A **coherent four-pillar chief of staff** on Telegram — architecture streamlined, every built feature live and gap-free, every conversation pillar-context-aware, proactive and goal-aligned, all connections proven. Chat feels **natural, useful, and precise** without the user learning routing tricks.

### v1 complete when (all true)

- [ ] **Agenda 1** — Full reintegration around Health, Wealth, Wisdom, Joy
- [ ] **Agenda 2** — Every tool and flow audited against 4-pillar philosophy
- [ ] **Agenda 3** — Every conversation surfaces the right pillar context
- [ ] **Agenda 4** — Magnus behaves as true chief of staff (coherent, proactive, goal-aligned)
- [ ] **Agenda 5** — Connection smoke matrix all green + seven-day owner simulation
- [ ] Architecture frozen — one spine, no duplicate execution paths
- [ ] `magnus.md` "Not built yet" trimmed to v2+ only
- [ ] `MAGNUS_VERSIONS.md` v1 Complete section written

---

## 2. Owner agenda (maps to this plan)

| # | Agenda item | How this plan closes it | Primary PRs |
|---|-------------|-------------------------|-------------|
| 1 | Full reintegration around 4 pillars | Per-pillar hardening + **PR #98 integration pass** | #91–#98 |
| 2 | Audit every tool & flow vs pillar philosophy | `PILLAR_TOOL_AUDIT.md` — mandatory Gate B every PR | #91 draft → #99 complete |
| 3 | Right pillar context every conversation | `PILLAR_CONTEXT_MAP.md` — mandatory Gate C every PR | #92 draft → #98 verified |
| 4 | True chief of staff | Brief/day (#94), goals/projects (#98), proactive (#99), voice (#93) | #93–#99 |
| 5 | Final smoke test | `CONNECTION_SMOKE_MATRIX.md` + seven-day sim | #100 |

---

## 3. Four-pillar model (audit against this)

```
                    ┌─────────────────────────────────────┐
                    │           MAGNUS (GENERAL)           │
                    │  Chief of staff · cross-pillar ops   │
                    │  calendar · events · lists · rhythm  │
                    └──────────────┬──────────────────────┘
                                   │
         ┌────────────┬────────────┼────────────┬────────────┐
         ▼            ▼            ▼            ▼            │
     HEALTH       WEALTH        WISDOM          JOY          │
   body, meals,   money,        learning,     taste, rest,  │
   training,      portfolio,    career,       relationships,│
   recovery       goals         shipping      creative joy  │
         │            │            │            │            │
         └────────────┴────────────┴────────────┘            │
                          │                                  │
              Operations · Goals · Projects                 │
              (activity layer — not a fifth pillar)          │
                          └──────────────────────────────────┘
```

### Naming canon

| Context | Term |
|---------|------|
| Code intent | `HEALTH`, `WEALTH`, `WISDOM`, `HAPPINESS` |
| Product / user-facing | Health, Wealth, Wisdom, **Joy** |
| DB / LifeOS events | May use `joy` |
| Magnus lane | `GENERAL` intent — **not** the Operations activity category |

See [`docs/product/ACTIVITY_TAXONOMY.md`](../product/ACTIVITY_TAXONOMY.md) for Operations vs Goals vs Projects.

### LifeOS rules (non-negotiable — check every PR)

1. **One focus per pillar** — finish or deliberately replace before stacking.
2. **No cross-pillar dependencies** — bad health week does not collapse wealth logic.
3. **Joy protected, not optimised** — joy tank is a tank, not a KPI to maximise.
4. **Morning brief is a read, not a task dump.**
5. **Locked day** — plan once; avoid re-deciding all day.
6. **Balance penalty** — any pillar at risk → system surfaces it (`pillar_status`, brief, drift guard).

---

## 4. Architecture target at PR #100

See [`ARCHITECTURE_COHERENCE.md`](./ARCHITECTURE_COHERENCE.md) for the full frozen diagram.

### One spine (every user turn)

```
Telegram message
  → magnus.ts (allowlist, persist, typing)
  → prelude (win confirm | undo | project session | photo augment)
  → classify intent + routing hints
  → load memory + pillar context (PILLAR_CONTEXT_MAP)
  → Haiku plan parser → steps[]
  → step executors (tools | health sub-agents | pillar prompts | day_overview | pillar_consultation)
  → Haiku composer (unless terminal OAuth/confirm)
  → accountability agent (action_ledger, action integrity)
  → persist assistant turn → HTML chunk → send
```

### Streamlining rules (every PR)

1. **One path per concern** — if two modules do the same thing, merge or document alias; do not leave both undocumented.
2. **Context before capability** — load pillar data before agent speaks.
3. **Tools serve pillars** — every tool has pillar + activity layer in `PILLAR_TOOL_AUDIT.md`.
4. **Magnus owns cross-pillar ops** — pillar specialists are prompt-only (Health/Wealth add data in executors).
5. **Trust is terminal** — accountability on every write path; deterministic outputs where promised.
6. **No new product surface in v1 close** — harden and integrate only; defer v2 items explicitly.

---

## 5. Mandatory PR gates (before every merge #91–#99)

```
┌─ GATE A: Technical ─────── npm test green; segment manual chat script pass;
│                           magnus.md updated if behavior changed
├─ GATE B: Pillar audit ─── every touched tool/flow row updated in PILLAR_TOOL_AUDIT.md
├─ GATE C: Context ──────── every touched intent verified in PILLAR_CONTEXT_MAP.md
└─ GATE D: Streamline ───── no new duplicate paths; dead code removed or documented
```

**PR #100 adds Gate E:** full `CONNECTION_SMOKE_MATRIX.md` + seven-day owner simulation.

---

## 6. Per-PR milestones (detailed)

### PR #91 — Foundation & Pillar Canon

**Branch:** `cursor/v1-pr91-foundation-9f4f` (suggested)  
**Theme:** Boot system; establish audit framework and pillar vocabulary.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 0.1 Boot & capabilities | `src/index.ts`, `src/config/magnusCapabilities.ts`, `.env.example` | `telegram:check` accurate; boot log honest |
| 0.2 Health HTTP / OAuth | `src/healthServer.ts`, `src/integrations/*/oauthFlow.ts` | `/health`, `/ready`, OAuth routes work |
| 1.1 Database | `supabase/migrations/`, `docs/DATABASE_SCHEMA.md` | Tables accounted for; `test:supabase` green |
| 1.2 Identity | `scripts/provision-owner-user.mts`, `src/users/userIntegrations.ts` | Provision produces usable owner |
| 2.1 Telegram | `src/tools/telegram.ts`, `src/magnus.ts`, `rateLimit.ts` | Dedupe, rate limit, `/start` `/help`, HTML chunk |

#### Pillar / agenda scope

- Create all review artifacts (skeletons) linked at top of this doc
- Draft `PILLAR_TOOL_AUDIT.md` with full tool inventory (status = `pending`)
- Lock Joy = `HAPPINESS` naming in docs touched
- `ARCHITECTURE_COHERENCE.md` — current-state diagram

#### Manual chat scripts

- Non-allowlisted user → refusal, zero chat rows
- Owner provision → integrations row exists
- `npm run telegram:check -- --json` snapshot saved in `V1_HARDENING_LOG.md`

#### Tests

```bash
npm test -- src/config/magnusCapabilities.test.ts
npm test -- src/healthServer.internal.test.ts src/healthServer.webhook.test.ts
npm run test:supabase   # with real creds
```

---

### PR #92 — Memory & Pillar Context Spine

**Theme:** Every conversation starts with correct pillar context.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 3.1 Memory | `src/agents/memory/*`, `src/config/lifeosContext.ts` | One load per turn; summary + facts update |
| 4.1 Prelude | `magnusOrchestrator.ts`, `projectSessionPrelude.ts`, `handleReversibleAction.ts` | Order: win → undo → project → photo → classify |
| 4.2 Intent + hints | `orchestratorIntent.ts`, `intentRoutingHints.ts`, `userQueryCatalog.ts` | 1000-msg suite + catalog validation green |

#### Pillar / agenda scope

- **Build `PILLAR_CONTEXT_MAP.md`** — per-intent minimum blocks (see that doc)
- Enable `MAGNUS_LIFEOS_CONTEXT_ENABLED=true` for owner once LifeOS data exists
- Verify memory package injects required blocks (live turn + metadata inspection)
- 5 routing-matrix messages per intent (see `USER_QUERY_GUIDE.md`)

#### Close criteria

- [ ] Context map drafted with all five intents
- [ ] Each intent has ≥1 verified live turn with correct memory block
- [ ] LifeOS empty tables do not inject noise

---

### PR #93 — Routing Spine & Voice Coherence

**Theme:** Parse → execute → compose → accountability — one path, one voice.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 4.3 Pillar strategy | `parsePillarStrategy.ts`, `executePillarPlan.ts`, `composePillarPlanReply.ts`, `catalogs/*` | All capabilities have executors |
| 4.4 Day overview + consultation | `dayOverview.ts`, `executePillarConsultation.ts`, `consultationOutcome.ts` | Compound asks one reply |
| 5.1 Accountability | `accountabilityAgent.ts`, `actionIntegrity.ts`, `finalizeMagnusVoice.ts` | No false saves; action_ledger on tool turns |

#### Pillar / agenda scope

- Tag every capability in all five catalogs with pillar + layer in `PILLAR_TOOL_AUDIT.md`
- Document `pillar_consultation` vs single-intent boundary
- Zero "Health agent says" voice leaks in 10 manual turns

#### Tests

```bash
npm test -- src/capabilities/catalogIntegrity.test.ts
npm test -- src/agents/routing/actionIntegrity.test.ts
npm test -- src/agents/routing/pillarStrategy/
```

---

### PR #94 — Operations Layer: Calendar, Events, Chief-of-Staff Day

**Theme:** Magnus runs your day.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 6.1 Calendar | `calendarTool.ts`, `integrations/googleCalendar/*` | Read-before-write; sync event log |
| 6.2 Event log | `eventLogTool.ts`, `events/eventStore.ts` | Reschedule chain; 2h dedupe; reminders |
| 6.3 Journal | `logNoteTool.ts`, `eventCompletionReconcile.ts` | Journal reconciles events |
| 10.3 Morning brief | `jobs/morningBrief*.ts`, `handleWinConditionPending.ts` | **Calendar in brief when connected** |

#### Pillar / agenda scope

- Brief = chief-of-staff read: calendar + commitments + planned meals + **pillar_status** + project next step
- `day_overview` loads all four pillar signals
- DRY: brief and day_overview share context builder where possible

#### Manual chat scripts

- `morning brief` → win question → yes/no/skip
- `what does tomorrow look like?` → day overview sections
- log commitment → reschedule → reminder fires

---

### PR #95 — Health Pillar: Meals & Planning

**Theme:** Health owns body and food — bulletproof.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 7.2 Meal logging | `mealIntakeParserAgent.ts`, `mealLogPipeline.ts`, `mealPlanVsLog.ts` | NL intake; undo; dedupe; plan≠log |
| 7.4 Meal planning | `mealPlanningAgent.ts`, `mealPlanningFlow.ts`, `mealPlanStore.ts` | Full journey no dead ends |
| 7.6 Vision | `src/vision/*` | Food photo → meal only when purpose=food |

#### Pillar / agenda scope

- All `healthCatalog` capabilities audited — pillar=Health, layer mapped
- Health turns always load program memory + weekly schedule + today's meal state

#### Manual chat scripts

- `I'm having chicken rice` → breakdown → `undo this`
- `plan my meals for the week` → lock → swap → shopping list
- `I'll eat pasta tomorrow` → plan, not log

---

### PR #96 — Health Pillar: Training, Hevy, Nutrition Rhythm

**Theme:** Training loop + gym operations sync.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 7.7 Fitness / Hevy | `fitnessAgent.ts`, `hevyClient.ts`, `formatHevyContext.ts` | Full set detail; deterministic volume |
| 7.5 Nutrition nightly | `nutritionNightlyJob.ts`, `mealRollupStore.ts` | Rollups; anomalies; program memory |
| 7.1 Onboarding | `healthOnboarding.ts` | 4 questions; meal log bypasses |

#### Pillar / agenda scope

- Gym schedule = Operations; program = Health memory; transformation = Project theme
- Gym ↔ Hevy reconcile: +3h grace, single nudge

---

### PR #97 — Joy & Wisdom Surfaces: Lists, YouTube, Notion, LifeOS

**Theme:** Joy owns taste; Wisdom owns growth artifacts; LifeOS wires balance.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 6.4 YouTube | `youtubeTool.ts`, `playlistResolve.ts` | Disambiguation; no silent wrong playlist |
| 6.5 Lists | `listTool.ts`, `listCatalog.ts`, `listService.ts` | All 10 slugs; **rich recommend filters** |
| 6.6 LifeOS | `lifeosStore.ts`, `lifeosTool.ts` | Write → read loop proven |
| 6.7 Notion | `notionProvision.ts`, `notionConnectTool.ts` | Reconnect fresh hub; mirror reliable |

#### Pillar / agenda scope

- Joy lists: watchlist, readlist, travel, food, music, experiences
- Wisdom: goals list, skill projects, learning coaching grounded in projects
- `log_joy_tank`, `update_pillar_status` → appear in memory next turn

---

### PR #98 — Four-Pillar Reintegration (integration PR)

**Theme:** Wealth + shallow pillars grounded; projects span pillars.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 9.1 Projects | `projectSetupFlow.ts`, `projectConflictService.ts`, `themes/index.ts` | All 6 themes E2E |
| 6.8 Kite | `kiteConnectTool.ts`, `formatKiteContext.ts` | Read-only portfolio in wealth turns |
| 8.1–8.3 Shallow pillars | `wealthAgent.ts`, `happinessAgent.ts`, `wisdomAgent.ts` | Grounded in memory |

#### Pillar / agenda scope — **Agenda #1 closes here**

- [ ] `PILLAR_TOOL_AUDIT.md` 100% — every row `audited` or `deprecated`
- [ ] `PILLAR_CONTEXT_MAP.md` 100% — every intent verified live
- [ ] Four pillars: verified grounded turns each
- [ ] `goal_manage` distinct from `project_setup`
- [ ] Max 3 active projects enforced

#### Manual chat scripts (minimum)

- Job search project: spark → lock → status → complete
- Kite portfolio question with holdings context
- `recommend from my watchlist`
- Wisdom learning plan while skill sprint active

---

### PR #99 — Proactive Chief of Staff & Rhythm

**Theme:** Magnus initiates — pillar-aware, goal-aligned.

#### Technical scope

| Segment | Key files | Close criteria |
|---------|-----------|----------------|
| 10.1 Cron | `proactive/cron.ts`, job runners | All jobs registered |
| 10.2 Kinds | `proactive/kinds/*`, `manageProactiveTool.ts` | Every kind triggered or staging-tested |
| Rhythm | `proactive/rhythm/*`, `seedDefaultRhythmSubscriptions` | Owner seeds on provision |

#### Pillar / agenda scope

- Tag every proactive kind with primary pillar(s) in `PILLAR_TOOL_AUDIT.md`
- Quiet hours 23:00–06:00; cap ~3/day (scheduled + user reminders exempt)
- Proactive compose includes pillar_status + active projects where relevant

---

### PR #100 — Architecture Freeze, Smoke Test, v1 Declaration

**Theme:** Prove everything; ship v1.

#### Deliverables

- [ ] `CONNECTION_SMOKE_MATRIX.md` — all cells green
- [ ] Seven-day owner simulation (see Section 8)
- [ ] Full CI gate (Section 9)
- [ ] `MAGNUS_VERSIONS.md` — v1 Complete section
- [ ] `magnus.md` — Last updated; Not built yet → v2+ only
- [ ] `ARCHITECTURE_COHERENCE.md` — final frozen state
- [ ] Version bump in `package.json` (v1.1 or v1 complete tag — owner choice)

---

## 7. Agent instructions (for Cloud Agents / Cursor subagents)

When assigned a PR from this plan:

1. **Read this file** and the PR-specific section above.
2. **Read** [`magnus.md`](../../magnus.md) — do not contradict without updating it.
3. **Open** `V1_HARDENING_LOG.md` — log start time, PR number, segments in scope.
4. **Follow the 5-step review loop** per segment:
   - Read key files; draw input → output flow
   - Run segment tests (`npm test -- <glob>`)
   - Execute manual chat scripts on owner account
   - Fix smallest correct diff; add test if real bug
   - Update `PILLAR_TOOL_AUDIT.md` and `PILLAR_CONTEXT_MAP.md` for touched rows
5. **Pass all four gates** before merge.
6. **Do not add v2 scope** (see Section 10).
7. **One PR per milestone** unless owner approves split.
8. **Branch naming:** `cursor/v1-prNN-<short-name>-9f4f`

### What to return in PR description

- Segments completed (IDs from this plan)
- Gates A–D checklist
- Manual chat scripts run (pass/fail)
- Rows updated in pillar audit + context map
- Known deferrals (if any) with reason

---

## 8. Seven-day owner simulation (PR #100)

| Day | Pillar emphasis | Exercises |
|-----|-----------------|-----------|
| Mon | GENERAL + cross | Morning brief; week planning; calendar move; day overview |
| Tue | Health | Meal log + photo; gym event; Hevy reconcile |
| Wed | Joy | List add; recommend from watchlist; YouTube playlist; joy tank |
| Thu | Health | Meal plan lock; shopping list; adherence nudge |
| Fri | Cross | Weekly wrap; project status; pillar_status check |
| Sat | Wisdom + Wealth | Learning plan; Kite portfolio (if connected); project checkpoint |
| Sun | Cross | Evening journal; proactive enable/disable; compound consultation ask |

**Pass:** No routing surprises in `magnus_chat_messages.metadata`; no false saves; context felt natural.

---

## 9. CI gate (PR #100)

```bash
npm test
npm run telegram:check
npx tsx scripts/dev/import-graph.mts
npx tsx scripts/dev/validate-user-query-catalog.mts
npm run test:supabase          # with real creds
```

Expected: all green; import-graph zero production orphans.

---

## 10. Explicitly out of scope (v2+)

Do **not** block v1 on these; do **not** implement in PRs #91–#100:

| Item | Target version |
|------|----------------|
| Semantic / vector memory (pgvector) | v2+ |
| Kite order placement | v2+ / maybe never (MF 403) |
| Deviation detection L1–L3 | v2+ |
| Operating modes (rough patch, intervention) | v2+ |
| Web UI / move off Telegram | v3 |
| Multi-user onboarding journey | v2 |
| New tools for Wealth/Happiness/Wisdom | v2+ (ground existing prompts in v1) |
| Live E2E against production APIs | Optional stretch; manual owner sim is required |
| WhatsApp | Not in scope |

---

## 11. Milestone tracker (update in V1_HARDENING_LOG.md)

| PR | Status | Merged | Gates | Notes |
|----|--------|--------|-------|-------|
| #91 Foundation | `pending` | — | — | |
| #92 Memory + context | `pending` | — | — | |
| #93 Voice + strategy | `pending` | — | — | |
| #94 Calendar + brief | `pending` | — | — | |
| #95 Health meals | `pending` | — | — | |
| #96 Health training | `pending` | — | — | |
| #97 Lists + LifeOS | `pending` | — | — | |
| #98 4-pillar integration | `pending` | — | — | |
| #99 Proactive | `pending` | — | — | |
| #100 v1 declare | `pending` | — | — | |

---

## 12. Related product docs

| Doc | Use when |
|-----|----------|
| [`docs/USER_QUERY_GUIDE.md`](../USER_QUERY_GUIDE.md) | Manual routing matrix scripts |
| [`docs/TOOLS_AND_AGENTS.md`](../TOOLS_AND_AGENTS.md) | Tool and agent inventory |
| [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) | Runtime architecture overview |
| [`docs/product/VISION.md`](../product/VISION.md) | Philosophy and beliefs |
| [`docs/product/PROJECT_DEFINITION.md`](../product/PROJECT_DEFINITION.md) | Project lifecycle |
| [`docs/review/AUDIT_2026-08-09.md`](./AUDIT_2026-08-09.md) | Security + coherence baseline |

---

**Last updated:** 2026-08-16
