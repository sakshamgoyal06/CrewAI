# Magnus

A personal health coach as an installable web app (PWA) with a thin Android app around it. Four tabs: **Coach** (chat, the home screen), **Today**, **Progress** and **You**. Chat and the screens log to the same place. People sign in with Google.

- **Coach chat**: tell it what you ate, walked or weighed in plain words. Meals come back as an editable estimate you confirm; steps, weigh-ins, goals and targets save directly. Ask "why am I off track?" and it answers from your data.
- **Today and Progress**: the north-star number (on-track days in the last 7), goal progress with required vs actual pace and a projected date, today's checks, meals, and recent Hevy workouts.
- **Gym slot check**: set a gym time for training days. A few hours after it (3 by default), the server checks Hevy; if no workout is there, the coach asks in chat whether you trained, and a skip is stored with its reason.
- **Hevy, read and write**: the coach analyses your Hevy history (which lifts are progressing, stalled or slipping), suggests swaps and rep changes, edits routines, creates routines and logs workouts. Every change is a card you apply; nothing is written to Hevy until you do. The tracker shows a Lifts card with each lift's trend.
- **Notifications**: Web Push from the server: morning plan, missed-meal reminders, step pace, the workout check, an evening wrap-up, weigh-in day and root-cause reviews. Each one can be turned off, and quiet hours apply. Turn them on in **You → Notifications**.
- **Root-cause analysis**: after two off-track days in a row, and every Sunday evening, the app mines the last 3 weeks (which checks fail, which days, missing meals, late eating, step patterns, skip reasons), writes one hypothesis and one 7-day experiment, and a week later checks whether the experiment moved the number. Also on demand: ask "why am I off track?".
- **Offline logging**: steps, weigh-ins, meal confirmations and workout-check answers made offline are kept on the phone and sent when it reconnects.
- **Android sync**: the Magnus Android app links Health Connect with one tap and syncs steps, walks, sleep, heart rate and smart-scale readings every hour. See [`android/README.md`](android/README.md).

The older Telegram assistant is parked in [`archive/`](archive/README.md). The plan and phases are in [`docs/HEALTH_PWA_PLAN.md`](docs/HEALTH_PWA_PLAN.md).

## Stack

Node 20 + TypeScript, Express, Anthropic SDK (coach chat and meal estimates), Supabase Postgres, Hevy API. The front end in `pwa/` is plain HTML/CSS/JS with no build step, served at `/app`. Deploys to Railway from the `Dockerfile`.

```
src/index.ts            starts the HTTP server
src/healthServer.ts     /health, /ready, /app (static PWA), /api/health
src/healthApp/          API routes, actions, coach chat, meals, goals, north star, Health Connect ingest
src/models.ts           every Claude model id, each with an env override
pwa/                    the app
android/                the Android app (Trusted Web Activity + Health Connect sync)
supabase/migrations/    database schema
archive/                the Telegram-era code, kept for reference
```

## Set up

1. `npm install`
2. Copy `.env.example` to `.env` and fill the required values.
3. Apply the migrations in `supabase/migrations/` in filename order (Supabase SQL editor, or `SUPABASE_DB_PASSWORD=… npm run db:apply -- <file>`). See [`supabase/README.md`](supabase/README.md).
4. `npm run dev` and open `http://localhost:8080/app/`. Sign in with Google; the first sign-in creates your profile and the coach walks you through your goal, targets and routine.
5. Connect Hevy in **You → Food, connections & account** with your own key from https://hevy.com/settings?developer.
6. On Android, install the APK from the `android-latest` release and connect Health Connect from inside it.

Usage caps per person per day are set with `MAGNUS_DAILY_{CHAT,PHOTO,RCA,DRAFT}_LIMIT` (see `.env.example`). Evals call the real model, so `npm run evals` refuses to run unless `MAGNUS_EVALS_ALLOW_API=1`.

## API

Routes need `Authorization: Bearer <token>`: a Google sign-in token, the owner token, or a personal `mgt_` token. Personal tokens made for a phone are ingest-only (`/ingest/health-connect`, `/steps`, `/whoami`).

| Route | Does |
|---|---|
| `GET /api/health/today` | Snapshot: today's checks, north star, goal progress, check-ins, meals, workouts |
| `GET /api/health/chat` · `POST /api/health/chat {text}` | Coach history · one coach turn (returns text, cards, `changed`) |
| `POST /api/health/meals/draft {text, slot?}` | Estimate a meal into an editable draft (nothing saved) |
| `POST /api/health/meals/confirm` | Save the confirmed draft items exactly; the draft id makes retries safe |
| `GET /api/health/meals?date=` · `DELETE /api/health/meals/:id` | List · remove a meal |
| `POST /api/health/steps` | Manual steps / walk minutes for a day |
| `POST /api/health/checkins` | Weigh-in: weight, body fat %, muscle mass |
| `POST /api/health/goal` · `POST /api/health/targets` | Outcome goal · daily targets, training days, gym slot (`gymTime`, `checkDelayMin`) |
| `GET /api/health/training` | 8-week Hevy analysis: per-lift trend, weekly volume (cached 10 min; `?fresh=1`) |
| `POST /api/health/hevy/proposals/:id/apply` · `/discard` | Apply or drop a coach-proposed Hevy change |
| `GET /api/health/push` · `POST /api/health/push/subscribe` · `/unsubscribe` · `/test` · `/prefs` | Web Push key, device subscription, test send, quiet hours and per-nudge toggles |
| `POST /api/health/rca` · `POST /api/health/rca/:id` | Run a root-cause analysis now · take up (`try`) or `decline` its experiment |
| `POST /api/health/workout-check` | Answer the post-gym check: `recheck`, `skipped` (+ `reason`), `trained_unlogged` |
| `POST /api/health/ingest/health-connect` | Health Connect sync from the Android app |

## Test

`npm test` runs the unit tests; `npx tsc --noEmit` type-checks.
