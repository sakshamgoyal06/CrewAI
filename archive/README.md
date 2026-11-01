# Archive: Magnus Telegram bot (parked 2026-10-27)

On 2026-10-27 Magnus was narrowed to one product: a **health-only PWA** (coach chat + tracker). Everything here is the earlier Telegram assistant and the tooling around it. It is kept, unchanged, as a parts bin to pull from as the app grows. Nothing in this folder is built, tested or deployed.

The Telegram bot is switched off in production and stays off.

## How the archive is laid out

Files keep their original paths under `archive/`, so `archive/src/x/y.ts` used to be `src/x/y.ts`. Imports between archived files still point at each other, and at the live `src/` files they used. `tsconfig.json` (`rootDir: src`) and `vitest.config.ts` (`src/**/*.test.ts`) don't look in here.

| Path | What it was |
|---|---|
| `src/magnus.ts`, `src/index.ts`, `src/healthServer.ts` | Telegram turn handler, old entrypoint (bot + webhook + watchdog), old HTTP server with Google/Notion/Kite OAuth routes and the morning-brief job route |
| `src/agents/` | Orchestrator, intent classifier, pillar specialists (health, wealth, happiness, wisdom), memory agent, tools |
| `src/pillars/health/workouts/agents/` | **fitnessAgent** (training advice from Hevy history) and **hevyWriteAgent** (create routines and log workouts from plain language) |
| `src/pillars/health/workouts/weeklySchedule.ts` | Parses the locked weekly gym schedule from program memory |
| `src/proactive/` | Cron + subscription engine: reminders, nudges, evening journal, weekly wrap, drift guard, dedupe and quiet-hour guards |
| `src/jobs/` | Morning brief, gym ↔ Hevy reconcile |
| `src/meals/` (archived parts) | Telegram meal flows: photo estimates, intent parsing, compose/reply formatting, pending confirmations, calorie disputes |
| `src/nutrition/` (archived parts) | Meal plans, templates, nightly nutrition job, weekly review, meal nudges |
| `src/integrations/` | Google Calendar (OAuth, read/write), Notion, Zerodha/Kite, YouTube |
| `src/lists/`, `src/projects/`, `src/lifeos/`, `src/youtube/`, `src/vision/` | Non-health features |
| `src/tools/` (archived parts) | Telegram runtime, chat log, Notion client, rate limits |
| `scripts/` | Telegram setup, Google/YouTube auth, Notion cleanup, owner provisioning, seed data, accuracy eval tooling |
| `docs/` | Architecture, agent roster, setup guides, the minimal-mode review plan and log |
| `.cursor/` | Cursor rules, hooks and health skills written for the bot (they pointed at `magnus.md`) |
| `magnus.md`, `MAGNUS_CORE_CONTEXT.md` | The old project tracker and core context |
| `.env.example`, `.env.production.example` | Full env reference for the bot |

## What the live app reuses (still in `src/`)

Hevy client (`src/pillars/health/workouts/hevy/`), the meal estimator chain (`src/meals/estimateMealNutrition.ts` + `providers/`), meal history and rollups (`src/nutrition/store/`), `localDate`, the Supabase/Redis/Anthropic clients, logger and user integrations.

## Likely next pulls

| App phase | Start from |
|---|---|
| Notifications | `src/proactive/` (scheduling, dedupe, quiet hours) with a Web Push sender instead of `outboundTelegraf.ts` |
| Log and create Hevy workouts in the app | `src/pillars/health/workouts/agents/hevyWriteAgent.ts`, `parseHevyWriteCommand` (still live), `weeklySchedule.ts` |
| Day planner | `src/integrations/google/` + `src/integrations/googleCalendar/`, `src/day/` (conflict detection) |
| Root-cause analysis | `src/proactive/signals/`, `src/nutrition/analytics/`, `src/agents/health/longTermHealthPlanningAgent.ts` |

## Bringing a file back

`git mv archive/src/<path> src/<path>`, then run `npx tsc --noEmit` and move back whatever else it needs (or rewrite that part). Bring its `*.test.ts` along. Keep the app's rule: chat and tracker write through `src/healthApp/actions.ts`.

## Database

No tables were dropped. Migrations stay in `supabase/migrations/`, and old tables (chat messages, events, lists, LifeOS, YouTube, Kite) are untouched.
