# Cursor prompts — creating Magnus agents (pillar → department → specialist)

**Purpose:** Copy each **Prompt block** below into **Cursor Agent** or **Composer** as the *entire* instruction for one session or one focused task. Each block is self-contained: context, files, steps, acceptance criteria, and guardrails.

**Read first (human or agent):**

- `docs/AGENT_ARCHITECTURE.md` — pillar / department / specialist target model  
- `src/agents/types.ts` — `AgentContext`, `AgentResult`, `DepartmentAgent`  
- `src/agents/planning/plannerAgent.ts` — reference pattern (Anthropic, `augmentUserWithMemory`, metadata)  
- `src/tools/clients.ts` — `anthropic` singleton

**Global conventions for every implementation prompt:**

1. **Language:** TypeScript, ESM (`import` / `.js` suffixes in imports).
2. **Model:** `claude-sonnet-4-6`, same as `plannerAgent.ts` unless the prompt says otherwise.
3. **User message:** Always pass `augmentUserWithMemory(ctx.rawMessage, ctx.memoryBlock)` (or append profile blocks then wrap) so memory stays consistent.
4. **Result:** Return `AgentResult` with `text` and `metadata` including `specialist`, `pillar`, `department` as specified.
5. **Tests:** Add `*.test.ts` beside the agent with Vitest; mock `anthropic` if needed (see `plannerAgent` / `registry.test.ts` patterns).
6. **Safety:** Wealth agents = **no** live trading, **no** order placement, **no** personalized financial advice disclaimers omitted. Health/Joy = no therapy/medical diagnosis.
7. **Wiring:** Unless the prompt explicitly says “wire to registry/orchestrator”, only implement the module + tests; a later prompt handles routing.

---

## How to use in Cursor


| Step | Action                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| 1    | Open this file and the **one** prompt block you need.                                                          |
| 2    | In Cursor **Agent** (or Composer), paste the **entire** block from `### Prompt` through `### End prompt`.      |
| 3    | @-mention `@docs/AGENT_ARCHITECTURE.md` and `@src/agents/planning/plannerAgent.ts` so the model sees patterns. |
| 4    | Run `npm run build` and `npm test` before marking done.                                                        |
| 5    | If the agent adds env vars, update `.env.example` with commented placeholders only.                            |


---

# Batch A — Wealth pillar (5 specialists)

### Prompt A1 — Trading copilot (Wealth → Trading)

**Goal:** Add a specialist that discusses **process, journaling, risk framing, post-mortems** — not execution.

**### Prompt**

You are working in the **Magnus** repository (Node.js, TypeScript, Vitest).

**Task:** Implement the **Trading copilot** specialist under the Wealth pillar.

**Requirements:**

1. Create `src/agents/wealth/tradingCopilotAgent.ts`:
  - Export `TRADING_COPILOT_SYSTEM` (string): you are a **process coach** for traders — journals, checklists, emotional discipline, reviewing what went wrong/right. Explicitly state: **you cannot place trades, connect to brokers, or give buy/sell instructions.** Encourage professional advice for complex situations.
  - Export `runTradingCopilotAgent(ctx: AgentContext): Promise<AgentResult>` using `anthropic` from `../../tools/clients.js`, `augmentUserWithMemory` from `../memory/memoryAgent.js`, model `claude-sonnet-4-6`, `max_tokens` ~768.
  - `metadata`: `{ specialist: "TradingCopilot", pillar: "wealth", department: "trading", departmentIntent: "WEALTH" }` (use string keys; align with existing metadata style).
2. Create `src/agents/wealth/tradingCopilotAgent.test.ts`:
  - Assert `TRADING_COPILOT_SYSTEM` contains clear no-trading / no-broker language.
  - Mock `anthropic.messages.create` to return a minimal text response; assert `runTradingCopilotAgent` returns expected metadata keys.
3. Create `src/agents/wealth/index.ts` barrel re-exporting the above.
4. Do **not** register in `registry.ts` unless you are explicitly asked in a separate task — this prompt is module + tests only.

**Acceptance criteria:**

- `npm run build` passes  
- `npm test` passes  
- No secrets in code; no real API keys

**### End prompt**

---

### Prompt A2 — Investment analyst (Wealth → Investment)

**### Prompt**

You are working in the **Magnus** repository.

**Task:** Implement **Investment analyst** specialist: `src/agents/wealth/investmentAnalystAgent.ts` + `investmentAnalystAgent.test.ts` + export from `src/agents/wealth/index.ts`.

**Behaviour:**

- System prompt: educational discussion of **allocation concepts**, diversification, long-horizon thinking, how to think about thesis risk — **not** personalized investment advice. Include a short disclaimer that this is not financial advice and the user should consult licensed professionals for their situation.
- Implement `runInvestmentAnalystAgent(ctx)` like `plannerAgent.ts` (Anthropic + `augmentUserWithMemory`).
- Metadata: `specialist: "InvestmentAnalyst"`, `pillar: "wealth"`, `department: "investment"`.

**Tests:** System string contains “not financial advice” or equivalent; smoke test with mocked Anthropic.

**### End prompt**

---

### Prompt A3 — Long-term financial planning (Wealth)

**### Prompt**

Magnus repo — add `src/agents/wealth/longTermFinancialPlanningAgent.ts` + tests + barrel export.

**Scope:** Milestones, savings trade-offs, scenario thinking in **plain language** — no tax/legal specifics as definitive answers; encourage professionals for jurisdiction-specific advice.

**Metadata:** `department: "long_term_financial_planning"`, `specialist: "LongTermFinancialPlanning"`, `pillar: "wealth"`.

Follow `plannerAgent.ts` patterns for LLM call and memory.

**### End prompt**

---

### Prompt A4 — Net worth & balance sheet (Wealth)

**### Prompt**

Magnus repo — implement `src/agents/wealth/netWorthAgent.ts` + tests.

**Optional data:** If Supabase tables like `portfolio_snapshots` (or similar in codebase) exist, you may add **read-only** optional context: query by `user_profile_id` from `ctx.userProfileId`, max few rows, graceful empty state. If no tables or errors, respond from user message only without failing.

**System prompt:** Explain categories (assets vs liabilities), conceptual “drift”, reconciliation habits — not accounting software.

**Metadata:** `specialist: "NetWorth"`, `department: "net_worth"`, `pillar: "wealth"`.

**### End prompt**

---

### Prompt A5 — FIRE & independence goals (Wealth)

**### Prompt**

Magnus repo — `src/agents/wealth/fireGoalsAgent.ts` + tests + barrel.

**Scope:** Educational framing of FIRE concepts (savings rate, rough timeline intuition, trade-offs). **Strong** disclaimer: illustrative only, not a financial plan.

**Metadata:** `specialist: "FireGoals"`, `department: "fire"`, `pillar: "wealth"`.

**### End prompt**

---

# Batch B — Joy pillar (3) + Wisdom (2)

### Prompt B1 — Relationship coach (Joy → Relationships)

**### Prompt**

Magnus — `src/agents/joy/relationshipCoachAgent.ts` + tests + `src/agents/joy/index.ts`.

**System prompt:** Communication prep, boundaries, social energy — **not** therapy or clinical mental-health treatment; encourage professionals for crisis or diagnosed conditions.

**Metadata:** `specialist: "RelationshipCoach"`, `pillar: "joy"`, `department: "relationships"`.

Mirror `plannerAgent.ts` structure.

**### End prompt**

---

### Prompt B2 — Adventure & trips (Joy)

**### Prompt**

Magnus — `src/agents/joy/tripDesignerAgent.ts` + tests + barrel.

**Scope:** Itinerary outlines, constraints, packing ideas — no real booking APIs required in v1.

**Metadata:** `specialist: "TripDesigner"`, `pillar: "joy"`, `department: "adventure_trips"`.

**### End prompt**

---

### Prompt B3 — Culture recommender (Joy)

**### Prompt**

Magnus — `src/agents/joy/cultureRecommenderAgent.ts` + tests + barrel.

**Scope:** Books, film, poetry suggestions given user mood/preferences in `rawMessage`; concise list format OK.

**Metadata:** `specialist: "CultureRecommender"`, `department: "culture"`, `pillar: "joy"`.

**### End prompt**

---

### Prompt B4 — Learning plan (Wisdom → Learning plan)

**### Prompt**

Magnus — `src/agents/wisdom/learningPlanAgent.ts` + tests + `src/agents/wisdom/index.ts`.

**Differentiation:** Focus on **curriculum-shaped learning** (milestones, topics, spaced practice) — not generic daily planning (that’s Planner). Reference LifeOS “one focus” lightly if natural.

**Metadata:** `specialist: "LearningPlan"`, `pillar: "wisdom"`, `department: "learning_plan"`.

**### End prompt**

---

### Prompt B5 — Learning tracker (Wisdom → Tracker)

**### Prompt**

Magnus — `src/agents/wisdom/learningTrackerAgent.ts` + tests + barrel.

**Scope:** Weekly learning reviews, habit adjustments, lightweight progress framing — optional future hooks to `learning_goals` / `learning_logs` tables if they exist in migrations; if not, skip DB and keep text-only.

**Metadata:** `specialist: "LearningTracker"`, `department: "tracker"`, `pillar: "wisdom"`.

**### End prompt**

---

# Batch C — Wisdom (build) + Health (specialists)

### Prompt C1 — Build / ship partner (Wisdom)

**### Prompt**

Magnus — `src/agents/wisdom/buildShipAgent.ts` + tests + barrel.

**Scope:** Project scoping, milestones, unblocking for **building/shipping** work — distinct from Planner’s locked-day life planning; more “maker” framing.

**Metadata:** `specialist: "BuildShip"`, `department: "build_ship"`, `pillar: "wisdom"`.

**### End prompt**

---

### Prompt C2 — Meal planner (Health → Nutrition)

**### Prompt**

Magnus — `src/agents/health/mealPlannerAgent.ts` + tests.

**Critical:** This is **not** the meal **logger** (`mealLogPipeline` / commands). It suggests **meal ideas** for a day or week given constraints in the user message; may reference existing env keys in comments only (CalorieNinjas etc.) but must not duplicate logging pipeline.

Export `tryMealPlannerAgent(ctx): Promise<AgentResult | null>` that returns `null` if the message is clearly **not** asking for planning (e.g. logging commands `/meal` — detect via `parseMealLogCommand` or `isMealCommand` from `src/meals/parseMealLogCommand.js` and return null for meal-log syntax).

**Metadata:** `specialist: "MealPlanner"`, `department: "nutrition"`, `pillar: "health"`, `sub_kind: "meal_plan"`.

**### End prompt**

---

### Prompt C3 — Alternates / swaps recommender (Health → Nutrition)

**### Prompt**

Magnus — `src/agents/health/alternatesRecommenderAgent.ts` + tests.

**Scope:** Food **substitutions** for dietary constraints, allergies, or macro targets — different from `mealParserAgent` (parsing for logs). Keyword or light classifier: if message asks for “instead of”, “swap”, “alternative to”, engage; else return null.

**Metadata:** `specialist: "AlternatesRecommender"`, `department: "nutrition"`.

**### End prompt**

---

### Prompt C4 — Long-term health planning (Health)

**### Prompt**

Magnus — `src/agents/health/longTermHealthPlanningAgent.ts` + tests.

**Scope:** Seasonal training arcs, race prep **conceptually**, multi-month habits — **non-medical**; no diagnosis.

**Metadata:** `specialist: "LongTermHealthPlanning"`, `department: "long_term_health_planning"`, `pillar: "health"`.

**### End prompt**

---

### Prompt C5 — Workouts coach facade (Health → Workouts)

**### Prompt**

Magnus — Introduce `src/agents/health/workoutsCoachAgent.ts` that **re-exports or thinly wraps** the existing fitness flow so the architecture names **Workouts** department explicitly.

**Requirements:**

1. Import `tryFitnessAgent` from `./fitnessAgent.js`.
2. Export `runWorkoutsCoachAgent(ctx)` that delegates to `tryFitnessAgent`; if null, return a short default encouraging workout-related questions OR return null — **match existing Health router behaviour expectations**; document in file comment that `healthRouter.ts` may later call this instead of `tryFitnessAgent` directly.
3. Tests: delegation returns same structure as fitness when mocked.

Do **not** change `healthRouter.ts` in this task unless needed for compilation — prefer additive file.

**### End prompt**

---

# Batch D — Routing primitives (5 tasks)

### Prompt D1 — Pillar and department types

**### Prompt**

Magnus — add `src/agents/routing/pillarTypes.ts`:

- Export string-literal types `Pillar` = `'health' | 'wealth' | 'wisdom' | 'joy'`.  
- Export `DepartmentId` as a union of string constants covering departments in `docs/AGENT_ARCHITECTURE.md` (use consistent snake or camel — pick one and document).  
- Export type `PillarRoute = { pillar: Pillar; department: string }`.  
- Pure functions only; no IO.

Add `src/agents/routing/pillarTypes.test.ts` with trivial assertions.

**### End prompt**

---

### Prompt D2 — Extend AgentContext

**### Prompt**

Magnus — extend `src/agents/types.ts` `AgentContext` with optional:

```ts
pillar?: import("./routing/pillarTypes.js").Pillar;
department?: string;
specialist?: string;
```

Ensure no circular imports (use type-only import if needed). Update any TypeScript errors in the repo. Run `npm run build` and fix call sites by leaving new fields optional (no behaviour change yet).

Add a one-line note in `docs/AGENT_ARCHITECTURE.md` under maintenance that `AgentContext` carries optional pillar/department.

**### End prompt**

---

### Prompt D3 — Legacy intent → pillar map (pure)

**### Prompt**

Magnus — add `src/agents/routing/intentToPillarRoute.ts`:

- Import `Intent` from `../../intent.js`.  
- Export `intentToPillarRoute(intent: Intent): PillarRoute` using a **documented** best-effort mapping, e.g. HEALTH→health/nutrition_default, WEALTH→wealth/trading_default, LEARNING→wisdom/learning_plan, PLANNING→wisdom/build_ship OR planning_override — **you must pick consistent defaults** and comment each case.  
- Export `inferPillarRouteFromMessage(message: string): PillarRoute | null` optional stub returning null (for future LLM).

Tests: table-test the `intentToPillarRoute` for every `Intent` value.

**### End prompt**

---

### Prompt D4 — Pillar classify system prompt (string only)

**### Prompt**

Magnus — add `src/agents/routing/pillarClassifyPrompt.ts` exporting:

- `PILLAR_CLASSIFY_SYSTEM` — instructions for the model to output **only** strict JSON: `{ "pillar": "...", "department": "...", "reason": "short" }` with allowed pillars health|wealth|wisdom|joy and departments drawn from `docs/AGENT_ARCHITECTURE.md`.  
- No network calls in this file — **constants only**.

Add a test that JSON appears parseable and pillars are restricted.

**### End prompt**

---

### Prompt D5 — Registry map (data structure, no full wiring)

**### Prompt**

Magnus — add `src/agents/routing/specialistCatalog.ts`:

- Export a **type** `SpecialistKey` that uniquely identifies pillar plus department (use TypeScript template literal types as appropriate).  
- Export const object `SPECIALIST_RUNNERS` as a **placeholder map** from string keys to **async functions** `(ctx: AgentContext) => Promise<AgentResult>` — use **no-op** or **notImplemented** throw for keys not yet implemented; wire **only** existing agents you can import without circular deps (e.g. re-export `runPlannerAgent` under a key `wisdom:planning_legacy` if needed). Document in comments that full wiring comes in a follow-up.

Goal: compile-time structure for future dispatch; minimal implementation.

Run `npm run build` / `npm test`.

**### End prompt**

---

# Meta prompts (orchestration & refactor)

### Meta 1 — Map existing codebase to pillar structure (analysis only)

**### Prompt**

You are in the **Magnus** repo. **Do not write production code** in this task — analysis and documentation only.

**Task:**

1. Read `docs/AGENT_ARCHITECTURE.md`, `docs/AGENT_ROSTER.md`, `src/agents/registry.ts`, `src/agents/magnusOrchestrator.ts`, and all files under `src/agents/` that export agents or `run`* functions.
2. Produce a **markdown table** with columns: **Current file / export**, **Role today**, **Target pillar**, **Target department**, **Target specialist label**, **Gap** (none | rename | split | wrap | new).
3. List **Morning Brief**, **Memory**, **Notion** as cross-cutting with how they attach to pillars (if at all).
4. Output the table into a new file `docs/EXISTING_TO_PILLAR_MAP.md` at repo root **or** under `docs/` (pick one; prefer `docs/EXISTING_TO_PILLAR_MAP.md`).
5. End with **5 prioritized refactors** (one sentence each).

**### End prompt**

---

### Meta 2 — Refactor orchestrator toward pillar dispatch (phased)

**### Prompt**

You are refactoring **Magnus** to align with `docs/AGENT_ARCHITECTURE.md`.

**Constraints:**

1. Single user-facing chat entry remains `runOrchestratorReply` in `src/agents/magnusOrchestrator.ts` (rename only if strictly necessary; prefer keeping name).
2. **Phase 1 (this session):** After intent resolution, compute `PillarRoute` using `intentToPillarRoute` from `src/agents/routing/intentToPillarRoute.ts` and attach `pillar` + `department` to `AgentContext` passed to `dispatchToAgent` / specialists. **Do not** remove legacy `Intent` yet.
3. **Do not** break Vitest: all tests green; update snapshots only if outputs change for metadata.
4. Wealth/Joy specialists from Batch A–B **must not** be called until registered — only attach routing metadata for logging.
5. Document changes in `docs/AGENT_ARCHITECTURE.md` §7 “Current code vs this model” with one paragraph.

**Deliverables:** Code + tests + doc touch; short summary in PR style at end of your reply.

**### End prompt**

---

## Maintenance

When a new specialist is added in code, add a **one-row** entry to the “Batch” section above or reference `AGENT_ARCHITECTURE.md` — avoid duplicating prompts in multiple places.

**Last updated:** 2026-04-12