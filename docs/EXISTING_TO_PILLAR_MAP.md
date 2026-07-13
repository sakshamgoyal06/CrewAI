# Existing code → pillar map

**Purpose:** Map current `src/agents/` exports (department agents, `run*` entrypoints, and closely related helpers) to the **target** model in `docs/AGENT_ARCHITECTURE.md` (pillars → departments → specialists).  
**Sources:** `docs/AGENT_ARCHITECTURE.md`, `docs/AGENT_ROSTER.md`, `src/agents/registry.ts`, `src/agents/magnusOrchestrator.ts`, agent modules as of 2026-04-12.

---

## Cross-cutting: Morning Brief, Memory, Notion

These are **not pillars** per `AGENT_ARCHITECTURE.md` §5; they attach around the orchestration flow rather than replacing pillar classification.

| Layer | Where it lives | How it attaches to pillars |
| ----- | -------------- | --------------------------- |
| **Morning Brief** | `src/jobs/morningBrief*.ts`, prompts in `src/jobs/morningBriefPrompt.ts`; Telegram `/morningbrief`; optional Notion page via `src/tools/notionMorningBrief.ts`. Memory hook: `src/agents/memory/briefContext.ts` re-exports `fetchMorningBriefContext` / `buildMorningBriefUserMessage` from `src/jobs/morningBriefContext.ts`. | **Synthesizes across all four pillars** when context exists (one-line reminders per pillar one-thing, Joy tank band, trends). It is a scheduled or manual **read**, not a routing destination; content is **about** pillars, not **owned by** a single pillar. |
| **Memory** | `src/agents/memory/memoryAgent.ts` (`loadMemoryContext`, `intentToMemoryPurpose`, `formatMemoryBlockForSystem`, `augmentUserWithMemory`), `semanticRecall` (stub), barrel `src/agents/memory/index.ts`; exported from `src/agents/index.ts`. | **Feeds every turn that loads context** (orchestrator + specialists). `intentToMemoryPurpose` maps intents to `chat` / `brief` / `pattern` buckets — a **cross-cutting concern** that can bias recall depth by topic (e.g. Joy/Culture → `pattern`) but does **not** assign a pillar by itself. |
| **Notion** | `src/agents/knowledge/notionAgent.ts` (`runNotionAgent`, `notionAgent`); keyword routing in `src/agents/knowledge/notionIntent.ts`; tools in `src/tools/notion.ts`. | **Human-readable log / second brain** — append daily log, query check-ins, create Goals rows. In the architecture doc it stays a **strong keyword/mode route** alongside pillars (`NOTION` intent). `src/agents/routing/intentToPillarRoute.ts` maps `NOTION` to `{ pillar: wisdom, department: learning_plan_development }`, which is a **best-effort code convenience**, not the conceptual “Notion layer” (see gap note in table). |

---

## Mapping table

**Gap legend:** **none** = already aligned or minor naming only; **rename** = vocabulary/intent label should change; **split** = one surface should become multiple target specialists/departments; **wrap** = needs an adapter layer to pillar/department metadata; **new** = missing wiring or stubbed capability.

| Current file / export | Role today | Target pillar | Target department | Target specialist label | Gap |
| --------------------- | ---------- | ------------- | ----------------- | ------------------------ | --- |
| `magnusOrchestrator.ts` → `runOrchestratorReply` | Single entry: classify / overrides → memory → delegate or GENERAL / Research / onboarding | Cross-cutting (orchestrator) | — | **Magnus orchestrator** | none |
| `magnusOrchestrator.ts` → `routingPlaceholder` | Copy when no `DepartmentAgent` handles intent | — | — | *(n/a — UX fallback)* | new (until all intents have agents or explicit policy) |
| `registry.ts` → `dispatchToAgent` / `findAgentForIntent` | First-match dispatch over `departmentAgents` | Cross-cutting | — | **Routing infrastructure** | wrap (should consume explicit pillar/department/specialist from context when classifier matures) |
| `knowledge/notionAgent.ts` → `notionAgent` / `runNotionAgent` | `NOTION` intent: append log, query check-in, create goal; deterministic tool paths | Cross-cutting (Notion layer) | *(not a pillar department — parallel “Knowledge ops”)* | **Notion connector** (Goals DB, daily log, check-ins) | wrap (treat as cross-cutting; avoid folding into Wisdom-only routing) |
| `health/healthRouter.ts` → `healthCompositeAgent` / `routeHealthMessage` | `HEALTH` intent: sequential first-accept across meal log, planners, fitness, nutrition, energy | Health | *(multiple — see child rows)* | **Health composite router** | split (already multiple specialists; should map each step to Nutrition / Workouts / Long-term health planning) |
| `health/nutritionOrchestrated.ts` → `runOrchestratedMealLogTurn` | Meal command pipeline: parser → APIs → reconcile → save | Health | Nutrition | **Meal logger** (+ API-backed **Calorie / macro estimator**) | none |
| `health/nutritionOrchestrated.ts` → `runOrchestratedNutritionAdviceTurn` | Nutrition chat with optional tool estimate | Health | Nutrition | **Calorie / macro estimator** + general nutrition coach | none |
| `health/mealParserAgent.ts` → `extractMealComponentsFromMessage`, `estimateMealComponentsInParallel`, `reconcileParserWithApiResults`, `buildAggregateMealEstimate`, … | Structured parsing and reconciliation for meal logging | Health | Nutrition | **Meal logger** (parse / reconcile sub-step) | none |
| `health/mealPlannerAgent.ts` → `tryMealPlannerAgent` | Day/week meal *ideas* when message matches planner patterns | Health | Nutrition | **Meal planner** | none |
| `health/longTermHealthPlanningAgent.ts` → `tryLongTermHealthPlanningAgent` | Season / race / multi-month training and habit arcs | Health | Long-term health planning | **Long-term health planning** (season plans, race prep) | none |
| `health/fitnessAgent.ts` → `tryFitnessAgent` | Workouts, training, performance; Hevy or `workouts` table context | Health | Workouts | **Programming coach** / **Workout logger** (data-backed) | none — lives at `src/pillars/health/workouts/agents/fitnessAgent.ts` |
| `health/hevyWriteAgent.ts` → `tryHevyWriteAgent` | Hevy routine/workout writes via structured commands | Health | Workouts | **Hevy write agent** | none — lives at `src/pillars/health/workouts/agents/hevyWriteAgent.ts` |
| `health/workoutsCoachAgent.ts` → `runWorkoutsCoachAgent` | Thin alias to `tryFitnessAgent` for naming | Health | Workouts | **Workouts coach** (same as Fitness path today) | none — lives at `src/pillars/health/workouts/agents/workoutsCoachAgent.ts` |
| `health/alternatesRecommenderAgent.ts` → `tryAlternatesRecommenderAgent` / `runAlternatesRecommenderAgent` | Food swaps / “instead of” | Health | Nutrition | **Alternates recommender** | none |
| `health/nutritionAgent.ts` → `tryNutritionAgent` | Keyword gate → `runOrchestratedNutritionAdviceTurn` | Health | Nutrition | **Nutrition** (advice path) | none |
| `health/energyAgent.ts` → `tryEnergyAgent` | Sleep / energy / recovery patterns (non-clinical) | Health | Workouts | **Recovery & energy** (per architecture §4.2) | rename (file says “Energy”; department target is Workouts → Recovery & energy) |
| `health/healthOnboarding.ts` → `startHealthOnboarding` / `runHealthOnboardingTurn` | Pre-HEALTH-stack onboarding until profile complete | Health | Nutrition | **Onboarding / preferences** | none |
| `planning/plannerAgent.ts` → `plannerAgent` / `runPlannerAgent` | `PLANNING` intent: locked-day, day/week prioritisation | Wisdom | Tracking & habits *(closest fit — rhythm & commitments)* | **Day/week prioritisation planner** | split (architecture does not name a separate “Life planning” department; may deserve explicit **Wisdom** sub-bucket or doc update) |
| `wisdom/learningTrackerAgent.ts` → `learningTrackerAgent` / `runLearningTrackerAgent` | `LEARNING` when `isLearningTrackerMessage`: weekly reviews, habits, DB rows | Wisdom | Tracking & habits | **Tracker coach** | none |
| `wisdom/learningPlanAgent.ts` → `learningPlanAgent` / `runLearningPlanAgent` | Remaining `LEARNING`: curriculum, milestones, spaced practice | Wisdom | Learning plan development | **Learning planner** | none |
| `wisdom/buildShipAgent.ts` → `buildShipAgent` / `runBuildShipAgent` | `BUILD` intent: ship work, milestones, unblocking | Wisdom | Build / ship | **Build / ship partner** | none |
| `joy/relationshipCoachAgent.ts` → `relationshipCoachAgent` / `runRelationshipCoachAgent` | `RELATIONSHIPS` intent | Joy | Relationships | **Relationship coach** | none |
| `joy/tripDesignerAgent.ts` → `tripDesignerAgent` / `runTripDesignerAgent` | `HAPPINESS` intent: trips, itineraries, packing | Joy | Adventure & trips | **Trip designer** | rename (intent `HAPPINESS` vs pillar **Joy**; also metadata `adventure_trips` — align vocabulary) |
| `joy/cultureRecommenderAgent.ts` → `cultureRecommenderAgent` / `runCultureRecommenderAgent` | `CULTURE` intent: books, film, poetry | Joy | Culture & leisure | **Culture recommender** | none |
| `intelligence/researchAgent.ts` → `runResearchAgent` | Invoked from orchestrator on `GENERAL` + research sub-route (not via `registry`) | Cross-cutting (**Research / gather**); primary use **Wisdom** research | *(often **Learning plan development** or topic-specific)* | **Research agent** | wrap (routed as `GENERAL` + heuristic, not pillar-first) |
| `memory/memoryAgent.ts` → `loadMemoryContext` / `intentToMemoryPurpose` / `formatMemoryBlockForSystem` / `augmentUserWithMemory` | Tiered Supabase context for turns | Cross-cutting | — | **Memory assembler** | none |
| `memory/memoryAgent.ts` → `semanticRecall` | Stub for pgvector / embeddings | Cross-cutting | — | **Semantic memory** | new |
| `memory/briefContext.ts` | Re-exports Morning Brief context builders | Cross-cutting | — | *(Morning Brief data layer)* | none |
| `routing/specialistCatalog.ts` → `SPECIALIST_RUNNERS` | Placeholder map `{pillar:department}` → runner; most throw; `wisdom:planning_legacy` → `runPlannerAgent` | — | — | **Future canonical specialist registry** | new |
| `routing/intentToPillarRoute.ts` → `intentToPillarRoute` | Maps `Intent` → `{ pillar, department }` for metadata experiments | — | — | **Routing helper** | split (several mappings disagree with live agents — e.g. `PLANNING` → `build_ship` vs `plannerAgent`; `NOTION` → `learning_plan_development`) |
| `wealth/tradingCopilotAgent.ts` → `runTradingCopilotAgent` | Trading process / journal coach (no broker) | Wealth | Trading | **Trading copilot** | new (not registered in `registry.ts`; `WEALTH` still placeholder at orchestrator) |
| `wealth/investmentAnalystAgent.ts` → `runInvestmentAnalystAgent` | Allocation / thesis style coaching | Wealth | Investment | **Investment analyst** | new |
| `wealth/longTermFinancialPlanningAgent.ts` → `runLongTermFinancialPlanningAgent` | Scenarios, milestones, cash-flow framing | Wealth | Long-term financial planning | **Long-term financial planning** | new |
| `wealth/netWorthAgent.ts` → `runNetWorthAgent` | Balance-sheet / snapshot narrative | Wealth | Net worth & balance sheet | **Net-worth reconciler** | new |
| `wealth/fireGoalsAgent.ts` → `runFireGoalsAgent` | FIRE / independence goals | Wealth | FIRE & independence goals | **FIRE modeller** | new |
| `agents/index.ts` (barrel) | Re-exports orchestrator + memory helpers | Cross-cutting | — | **Public API surface** | wrap |

**Registry order (first match wins):** `notionAgent` → `healthCompositeAgent` → `plannerAgent` → `learningTrackerAgent` → `learningPlanAgent` → `buildShipAgent` → `relationshipCoachAgent` → `tripDesignerAgent` → `cultureRecommenderAgent` — see `src/agents/registry.ts`.

---

## Prioritized refactors (five)

1. **Introduce and thread `pillar` + `department` + `specialist` on `AgentContext` end-to-end** (as recommended in `AGENT_ARCHITECTURE.md` §7) so orchestrator, memory purposes, and logs share one routing vocabulary instead of legacy `Intent` alone.  
2. **Reconcile `intentToPillarRoute` with live behaviour** — today `PLANNING` maps to `wisdom/build_ship` while `plannerAgent` is the handler; `NOTION` maps into Wisdom though Notion is documented as cross-cutting.  
3. **Register or deliberately defer Wealth specialists** — `run*Agent` implementations exist under `src/agents/wealth/` but `WEALTH` still hits `routingPlaceholder`; either wire `dispatchToAgent` or move files to a clearly marked staging area.  
4. **Replace or implement `SPECIALIST_RUNNERS` placeholders** so the canonical `{pillar}:{department}` map in `specialistCatalog.ts` becomes the real dispatch path (or delete the duplicate model to avoid three routing stories: intent, registry order, catalog).  
5. **Complete `semanticRecall` or narrow its contract** — until pgvector/RPC exists, document call sites and avoid implying embeddings-backed recall in user-facing behaviour.
