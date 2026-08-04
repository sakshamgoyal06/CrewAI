# Magnus architecture

Multi-user when provisioned per `user_profile`; one Telegram bot, four pillars, one voice.

Magnus is the only thing the user talks to and the only thing that talks back. Behind him, four
pillar specialists handle depth. The user cannot address a specialist and is never told one was
used — there are no department commands, no lane picker, and no "handing this to the health
specialist" notice.

Companion docs: `magnus.md` (tracker), `docs/TELEGRAM_SETUP.md` (setup and hosting),
`docs/GOOGLE_CALENDAR.md` (calendar), `docs/YOUTUBE.md` (YouTube / YT Music).

---

## 1. The shape

```
Telegram message
      │
      ├─ /start, /help ──────────────► answered locally, no model call
      │
      ▼
  magnus.ts        access gate → persist user turn → typing indicator
      ▼
  orchestrator     classify to one of five intents (silently)
      │
      ├─ GENERAL ──────────────────►  MAGNUS himself (has tools)
      │                                 • Google Calendar: read, create, update, delete
      │                                 • YouTube / YT Music: connect link, search, playlists, bookmarks, cue
      │                                 • log_note: Supabase + Notion
      │                                 • event log: plan, update, reschedule, list
      │
      ├─ HEALTH ───────────────────►  Health composite (deep: sub-router + external data)
      ├─ WEALTH ───────────────────►  Wealth agent
      ├─ HAPPINESS ────────────────►  Happiness agent
      └─ WISDOM ───────────────────►  Wisdom agent
      ▼
  magnus.ts        persist assistant turn → chunk → HTML → send
```

One message in, one reply out. Routing appears only in `magnus_chat_messages.metadata`.

## 2. Who owns what

| Owner | Scope |
|---|---|
| **Magnus** | The day and week, calendar, journaling and logging, reminders, anything spanning pillars, ordinary conversation |
| **Health** | Training, workouts, meals and macros, sleep, recovery, energy, the health journal |
| **Wealth** | Budgeting, spending, saving, debt, net worth, financial goals, investing philosophy |
| **Happiness** | Books, film, music for pleasure, games, hobbies, creative practice, rest, travel, relationships |
| **Wisdom** | Learning plans and review, skills and craft, career direction and growth, shipping projects |

Health is deliberately deeper than the rest: it has a sub-router, external data (Hevy, nutrition
providers), committed program memory, and a multi-turn onboarding gate. The other three are single
prompt-only agents sharing one runner (`src/agents/pillarSpecialist.ts`) — the place to add depth
when a pillar earns it.

## 3. Connections

| Connection | Required | Used by | What happens without it |
|---|---|---|---|
| **Telegram** | Boot | The interface | Nothing runs |
| **Supabase** | Boot | Profiles, chat history, logs, meals, journals | Nothing runs |
| **Upstash Redis** | Boot | Rate limit, update dedupe | Nothing runs |
| **Anthropic** | Boot | Classifier and every agent | Nothing runs |
| **Google Calendar** | Optional | Magnus (read, create, update, delete) | Magnus says it is not connected |
| **YouTube / YT Music** | Optional (per-user) | Magnus (connect link, search, playlists, bookmarks, cue) | Magnus offers `connect_youtube` / says not connected |
| **Hevy** | Optional | Health (read sessions, write routines) | Coaching from Supabase `workouts` only |
| **Notion** | Optional | Magnus `log_note`, Morning Brief page | Notes still save to Supabase |
| **Anthropic `web_search`** | Optional, default on | Meal estimates | Falls through to USDA / CalorieNinjas |
| **USDA FDC**, **CalorieNinjas** | Optional | Meal estimates | Meals log without macros |

## 4. Health internals

Sequential first-accept — the first sub-specialist that claims the message answers it:

```
meal log ("log lunch: …")  →  journal (end-of-day phrasing)  →  Hevy write ("hevy routine: …")
  →  fitness (training, Hevy reads)  →  nutrition (advice)  →  generic acknowledgement
```

Onboarding gates the pillar: until `user_health_profile.onboarding_completed_at` is set, every
health turn continues the four-question flow, so advice starts from real constraints. Meal logging
bypasses the gate — logging food should never be blocked.

Program memory comes from `.cursor/skills/health/references/` (committed, bundled into the Docker
image) plus journals in `magnus_daily_logs`.

## 5. Runtime modules

| Area | Files |
|---|---|
| Lifecycle | `index.ts`, `magnus.ts`, `healthServer.ts`, `logger.ts`, `env.ts`, `util/loggableError.ts` |
| Telegram | `tools/telegram.ts`, `telegramWatchdog.ts`, `rateLimit.ts`, `config/telegramRuntime.ts`, `config/telegramCommands.ts` |
| Presentation | `magnus/telegramIntro.ts`, `telegramFormat.ts`, `telegramChunk.ts` |
| Routing | `intent.ts`, `agents/orchestratorIntent.ts`, `agents/magnusOrchestrator.ts`, `agents/registry.ts`, `routing/intentToPillarRoute.ts` |
| Magnus's tools | `agents/tools/calendarTool.ts`, `agents/tools/logNoteTool.ts`, `agents/tools/eventLogTool.ts`, `agents/tools/youtubeTool.ts`, `agents/tools/youtubeConnectTool.ts` |
| YouTube | `integrations/youtube/` (incl. `oauthFlow.ts`), `youtube/youtubeStore.ts`, `config/publicBaseUrl.ts` |
| Memory | `agents/memory/{memoryAgent,format,types}.ts` |
| Persistence | `tools/chatLog.ts`, `tools/dailyLog.ts` |
| Morning Brief | `jobs/*.ts` — Magnus's optional proactive daily push (`MAGNUS_MORNING_BRIEF_CRON_ENABLED`) |
| Capability report | `config/magnusCapabilities.ts` |

`npx tsx scripts/dev/import-graph.mts` reports zero unreachable files; keep it that way.

## 6. Database

| Written | Read only |
|---|---|
| `user_profile`, `magnus_chat_messages`, `magnus_daily_logs`, `meal_logs`, `user_health_profile`, `magnus_events`, `magnus_youtube_bookmarks`, `magnus_youtube_cues`, `magnus_youtube_state` | `workouts`, `goals`, `memory_summaries`, `daily_scores`, `happiness_reserve`, `patterns`, `life_patterns`, `pillar_status`, `kpi_readings`, `magnus_insights`, `daily_plans` |

The read-only set feeds memory context and the Morning Brief. Nothing writes to it, so it stays
empty and shows up as `gaps` on every turn — the largest remaining gap in the design. Either write
to those tables or stop reading them.

`supabase/migrations/` covers tables added since April 2026; core tables (`user_profile`,
`magnus_chat_messages`) and LifeOS domain tables predate migrations — see `docs/DATABASE_SCHEMA.md`
and `docs/review/IMPARTIAL_REVIEW_2026-08-04.md` for the full picture and cleanup plan.

## 7. Deliberate omissions

- **No user-facing commands beyond `/start` and `/help`.** Everything else is plain language.
- **No specialist announcements.** The user hears one voice.
- **No calendar change without a read first.** Edits and deletes work from an event id returned by
  a read, so Magnus cannot act on a guess, and it asks when several events match.
- **No research agent or web search for general questions.** Magnus answers from knowledge and
  memory; only meal estimates search the web.
- **No semantic memory.** Recall is recent-window plus structured reads, not embeddings.
