# Magnus architecture — components and what earns its place

Single-user production deployment. Every component is listed with a **keep / decide / cut** rating.
Ratings are evidence-based: reachability comes from `npx tsx scripts/dev/import-graph.mts` and the
routing trace below; usage comes from `magnus_chat_messages` (Apr 12 – Jul 27, 2026, 120 rows).

Companion docs: `magnus.md` (tracker), `docs/TELEGRAM_SETUP.md` (setup and hosting).

---

## 1. External connections

Everything Magnus talks to. "Boot" means the process refuses to start without it.

| Connection | Purpose | Required | Reached from | Rating |
|---|---|---|---|---|
| **Telegram** (Telegraf) | The entire user interface | **Boot** | `src/tools/telegram.ts`, webhook route on the health server | **Keep** |
| **Supabase** (Postgres) | Profiles, chat history, meal logs, journals, memory | **Boot** | `src/tools/clients.ts` + ~20 modules | **Keep** |
| **Upstash Redis** | Rate limit, update dedupe, `/menu` state, brief dedupe | **Boot** | `src/tools/rateLimit.ts`, `pendingSlashSelection.ts`, `telegram.ts` | **Keep** |
| **Anthropic Claude** | Classifier, every specialist, Morning Brief | **Boot** | ~30 agent files | **Keep** |
| **Hevy** | Read sessions/routines; create routines, log workouts | Optional | `src/pillars/health/workouts/` | **Keep** — 13 turns used it |
| **Notion** (chat agent) | LifeOS logs, goals, check-ins | Optional | `src/tools/notion.ts`, `notionAgent.ts` | **Keep** — 12 turns |
| **Notion** (Morning Brief page) | Optional child page per brief | Optional | `src/tools/notionMorningBrief.ts` | **Decide** — only if you read briefs in Notion |
| **Anthropic `web_search`** | Meal nutrition lookup, first in the chain | Optional, on by default | `src/meals/providers/webResearchEstimate.ts` | **Keep** |
| **USDA FDC** | Structured nutrition data | Optional | `src/meals/providers/usdaFdc.ts` | **Keep** — free, better than web guessing |
| **CalorieNinjas** | Natural-language nutrition fallback | Optional | `src/meals/providers/calorieNinjas.ts` | **Decide** — redundant with USDA |
| **SerpAPI** | Google search for research and meal fallback | Optional | `src/tools/research/search.ts` | **Decide** — research works on pasted URLs without it |
| **Arbitrary page fetch** | Read URLs you paste or Serp returns | Optional | `src/tools/research/fetch.ts` | **Keep** — this is what makes research real |
| **HealthifyMe proxy** | Bridge to a service you'd have to host | Optional | `src/meals/providers/healthifyMeProxy.ts` | **Cut** — no proxy exists; dead branch in the chain |
| **Google Calendar** | Calendar read/write | Not wired | `mcp/`, `src/integrations/googleCalendar/` — **Cursor IDE only** | **Decide** — wire into Planner or cut |

Not connections, but worth naming: `.cursor/skills/health/references/` is **read at runtime** and
shipped in the Docker image. It is program memory, not IDE config.

---

## 2. Message path

```
Telegram update
  → telegram.ts        dedupe (Redis) → rate limit → /start /help /menu /morningbrief handled locally
  → magnus.ts          resolve profile → allowlist gate → persist user row
  → magnusOrchestrator slash command OR classify intent → pillar route → load memory
  → registry.ts        dispatch to the first agent that handles the intent
  → agent              Claude (+ tools) → reply
  → magnus.ts          persist assistant row → chunk → HTML → send
```

---

## 3. Agents

Usage = turns handled, from `metadata.delegated_agent` and `agent_metadata.specialist`.

### Live and used

| Agent | Entry | Turns | Rating |
|---|---|---|---|
| Health composite (router) | `agents/health/healthRouter.ts` | 34 | **Keep** |
| Fitness (Hevy reads) | `pillars/health/workouts/agents/fitnessAgent.ts` | 9 | **Keep** |
| Hevy write | `pillars/health/workouts/agents/hevyWriteAgent.ts` | 4 | **Keep** |
| Culture recommender | `agents/joy/cultureRecommenderAgent.ts` | 12 | **Keep** |
| Notion | `agents/knowledge/notionAgent.ts` | 12 | **Keep** |
| Build & Ship | `agents/wisdom/buildShipAgent.ts` | 10 | **Keep** |
| Health onboarding | `agents/health/healthOnboarding.ts` | 10 | **Keep** — gate, no LLM |
| Nutrition advice | `agents/health/nutritionAgent.ts` | 2 | **Keep** |
| Planner | `agents/planning/plannerAgent.ts` | 1 | **Keep** |

### Live, never used in 3.5 months

Each is real code that works — the question is whether you want the surface area.

| Agent | Entry | Rating |
|---|---|---|
| Meal log pipeline | `agents/health/nutritionOrchestrated.ts` + `src/meals/**` | **Keep** — heavily built, and the reason for the nutrition APIs |
| Health journal | `agents/health/healthJournalAgent.ts` | **Keep** — you journal daily, just in Cursor rather than Telegram |
| Meal planner | `agents/health/mealPlannerAgent.ts` | **Decide** |
| Long-term health planning | `agents/health/longTermHealthPlanningAgent.ts` | **Decide** |
| Alternates recommender | `agents/health/alternatesRecommenderAgent.ts` | **Decide** |
| Energy | `agents/health/energyAgent.ts` | **Decide** |
| Research | `agents/intelligence/researchAgent.ts` | **Decide** |
| Learning plan / tracker | `agents/wisdom/learningPlanAgent.ts`, `learningTrackerAgent.ts` | **Decide** |
| Relationship coach | `agents/joy/relationshipCoachAgent.ts` | **Decide** |
| Trip designer | `agents/joy/tripDesignerAgent.ts` | **Decide** |
| Wealth: trading, investment, FIRE, net worth, financial planning | `agents/wealth/**` (5 agents + router) | **Decide** — largest unused block, ~450 lines, prompt-only |

Four health sub-specialists (meal planner, long-term, alternates, energy) are keyword-gated inside
one router. They cost nothing when they decline a message, but each is a place for routing to go
wrong — the health router already fell through to its generic acknowledgement twice.

### Removed (this pass)

Non-functional by definition — they existed to say they did nothing:

| Removed | Was |
|---|---|
| `routing/specialistCatalog.ts` | Map of specialists that threw "not implemented"; nothing imported it |
| `semanticRecall()` | Always returned `{available: false}`, and told every specialist prompt so |
| `inferPillarRouteFromMessage()` | Always returned `null` |
| "agents coming soon" placeholder | Now an honest fallback that logs a warning |
| `agents/health/{fitness,hevyWrite,workoutsCoach}Agent.ts` | Deprecated re-export shims, zero importers |
| `workoutsCoachAgent` (pillars) | Alias of `tryFitnessAgent` the router never called |
| 5 barrel `index.ts` files, `memory/briefContext.ts`, `integrations/hevy/index.ts` | Re-exports nothing imported |
| `health/healthSignals.ts` | Superseded by per-agent patterns; only its own test used it |

---

## 4. Runtime modules

All on the message path; none optional.

| Area | Files | Rating |
|---|---|---|
| Entry and lifecycle | `index.ts`, `magnus.ts`, `healthServer.ts`, `logger.ts`, `env.ts`, `util/loggableError.ts` | **Keep** |
| Telegram | `tools/telegram.ts`, `telegramWatchdog.ts`, `rateLimit.ts`, `pendingSlashSelection.ts`, `config/telegramRuntime.ts` | **Keep** |
| Presentation | `magnus/telegramIntro.ts`, `telegramFormat.ts`, `telegramChunk.ts`, `delegationNotice.ts`, `intentDisambiguation.ts` | **Keep** |
| Routing | `intent.ts`, `agents/orchestratorIntent.ts`, `routing/slashCommands.ts`, `intentToPillarRoute.ts`, `pillarTypes.ts`, `registry.ts` | **Keep** |
| Persistence | `tools/chatLog.ts`, `dailyLog.ts` | **Keep** |
| Memory | `agents/memory/{memoryAgent,format,types}.ts` | **Keep** |
| Morning Brief | `jobs/*.ts` (7 files) | **Decide** — cron is off by default; `/morningbrief` works on demand |
| Config | `config/magnusCapabilities.ts`, `projectSettings.ts` | **Keep** |

---

## 5. Database

Tables the application actually touches:

| Written | Read only |
|---|---|
| `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `meal_logs`, `user_health_profile` | `workouts`, `goals`, `memory_summaries`, `daily_scores`, `happiness_reserve`, `patterns`, `life_patterns`, `pillar_status`, `kpi_readings`, `magnus_insights`, `daily_plans`, `learning_goals`, `learning_logs`, `portfolio_snapshots` |

The read-only tables feed memory context and the Morning Brief. **Nothing writes to them**, so they
stay empty and surface as `gaps` in the memory block on every turn. That is the single largest
architectural gap: memory reads a schema the product never fills.

`supabase/migrations/` covers only `magnus_daily_logs`, `user_health_profile`, and `meal_logs`.
Everything else was applied straight to the project and exists in no migration — so the schema
cannot be rebuilt from this repo.

---

## 6. Operations and tooling

| Component | Rating |
|---|---|
| `Dockerfile`, `railway.toml` | **Keep** |
| `.github/workflows/ci.yml` (build + test) | **Keep** |
| `scripts/telegram/setup.mts` | **Keep** — capability report and bot config |
| `scripts/test-supabase.mts` | **Keep** — credential smoke test |
| `scripts/dev/import-graph.mts` | **Keep** — how this audit was verified |
| `scripts/health/workouts/hevy/` (5 read/search/smoke scripts) | **Keep** |
| `scripts/google-calendar-auth.mts`, `mcp/google-calendar/` | **Decide** — with the Calendar integration |
| `scripts/magnus_db_hardening.sql` | **Decide** — reference SQL for tables with no migration |
| `docker-compose.example.yml` | **Cut** — Railway is the deployment; the healthcheck uses `wget`, absent from alpine |
| `.cursor/skills/health/references/` | **Keep** — runtime program memory |
| `.cursor/{rules,hooks,agents,skills/*/SKILL.md}` | **Keep** — IDE only, zero runtime cost |

---

## 7. Documentation

| Doc | Rating |
|---|---|
| `magnus.md` | **Keep** — tracker and source of truth |
| `docs/TELEGRAM_SETUP.md` | **Keep** — setup and hosting |
| `docs/ARCHITECTURE.md` (this) | **Keep** |
| `docs/DEPLOY_TELEGRAM.md` | **Decide** — hosting content now duplicated here and in TELEGRAM_SETUP |
| `docs/AGENT_ROSTER.md` (585 lines), `AGENT_ARCHITECTURE.md` | **Decide** — planning documents for agents that are now built; they describe a target, not the code |
| `docs/CURSOR_AGENT_PROMPTS.md`, `docs/EXISTING_TO_PILLAR_MAP.md` | **Cut** — both describe the April migration as future work and cite modules deleted in this pass (`specialistCatalog.ts`, `semanticRecall`, `briefContext.ts`, `agents/index.ts`) |
| `MAGNUS_CORE_CONTEXT.md` | **Keep** — product intent, not duplicated |

---

## 8. Known gaps

1. **Memory reads tables nothing writes.** Fifteen read-only tables produce `gaps` every turn.
   Either write to them or stop reading them.
2. **Schema is not reproducible.** Most tables have no migration in this repo.
3. **Meal provider chain has four sources for one job.** Web search, USDA, HealthifyMe proxy
   (nonexistent), CalorieNinjas, plus an optional LLM fallback.
4. **Two health journal paths.** Cursor writes files; Telegram writes `magnus_daily_logs`.
