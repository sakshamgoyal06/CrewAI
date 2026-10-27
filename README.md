# Magnus

A personal health coach as an installable web app (PWA). Chat is the home screen; the tracker is the second page. Both log to the same place.

- **Coach chat**: tell it what you ate, walked or weighed in plain words. Meals come back as an editable estimate you confirm; steps, weigh-ins, goals and targets save directly. Ask "why am I off track?" and it answers from your data.
- **Tracker**: the north-star number (on-track days in the last 7), goal progress with required vs actual pace and a projected date, today's checks, meals, and recent Hevy workouts.
- **Android sync**: steps, walks and smart-scale readings arrive from Health Connect through the HC Webhook app.

The older Telegram assistant is parked in [`archive/`](archive/README.md). The plan and phases are in [`docs/HEALTH_PWA_PLAN.md`](docs/HEALTH_PWA_PLAN.md).

## Stack

Node 20 + TypeScript, Express, Anthropic SDK (coach chat and meal estimates), Supabase Postgres, Upstash Redis, Hevy API. The front end in `pwa/` is plain HTML/CSS/JS with no build step, served at `/app`. Deploys to Railway from the `Dockerfile`.

```
src/index.ts            starts the HTTP server
src/healthServer.ts     /health, /ready, /app (static PWA), /api/health
src/healthApp/          API routes, actions, coach chat, meals, goals, north star, Health Connect ingest
pwa/                    the app
supabase/migrations/    database schema
```

## Set up

1. `npm install`
2. Copy `.env.example` to `.env` and fill the required values.
3. Apply the migration `supabase/migrations/20261027120000_health_app_activity.sql` (Supabase SQL editor, or `SUPABASE_DB_PASSWORD=… npm run db:apply -- <file>`).
4. `OWNER_TIMEZONE=Asia/Kolkata npm run app:setup`, then put the two printed values (`MAGNUS_HEALTH_APP_USER_PROFILE_ID`, `MAGNUS_HEALTH_APP_TOKEN`) in `.env` / Railway.
5. Store your Hevy key: `npx tsx scripts/upsert-user-integrations.mts` (or set `HEVY_API_KEY`).
6. `npm run dev`, open `http://localhost:8080/app/`, paste the token. On the phone, open the Railway URL in Chrome → menu → **Install app**.
7. In the app, open **Tracker → ⚙** and set your goal (target weight / body fat / muscle mass + deadline) and daily targets.

## Android steps and weigh-ins (Health Connect)

A web app can't read Health Connect directly, so the free [HC Webhook](https://github.com/mcnaveen/health-connect-webhook) app pushes it:

1. Install **Health Connect** and **HC Webhook** (Play Store). Make sure your step source (Google Fit, Samsung Health, Fitbit, your watch) writes to Health Connect.
2. In HC Webhook, grant **Steps, Distance, Exercise, Weight, Body fat**.
3. Add a webhook: URL `https://<your-railway-domain>/api/health/ingest/health-connect`, format **JSON**, custom header `Authorization: Bearer <MAGNUS_HEALTH_APP_TOKEN>`.
4. Data types → steps and distance resolution **60 minutes** with **Count overlapping apps once** on (so a phone and a watch aren't counted twice).
5. Sync mode **Interval, 30 minutes**. Exclude HC Webhook from battery optimization.

Buckets are stored per hour and the day's totals are rebuilt from them, so re-sent or edited buckets never double count. Walking and hiking sessions count as walk minutes. A smart-scale reading merges into that day's check-in without wiping fields you entered by hand. Health Connect has no muscle-mass type, so log muscle mass in the app.

## API

All routes need `Authorization: Bearer <MAGNUS_HEALTH_APP_TOKEN>`.

| Route | Does |
|---|---|
| `GET /api/health/today` | Snapshot: today's checks, north star, goal progress, check-ins, meals, workouts |
| `GET /api/health/chat` · `POST /api/health/chat {text}` | Coach history · one coach turn (returns text, cards, `changed`) |
| `POST /api/health/meals/draft {text, slot?}` | Estimate a meal into an editable draft (nothing saved) |
| `POST /api/health/meals/confirm` | Save the confirmed draft items exactly; the draft id makes retries safe |
| `GET /api/health/meals?date=` · `DELETE /api/health/meals/:id` | List · remove a meal |
| `POST /api/health/steps` | Manual steps / walk minutes for a day |
| `POST /api/health/checkins` | Weigh-in: weight, body fat %, muscle mass |
| `POST /api/health/goal` · `POST /api/health/targets` | Outcome goal · daily targets and training days |
| `POST /api/health/ingest/health-connect` | HC Webhook payloads |

## Test

`npm test` runs the unit tests; `npx tsc --noEmit` type-checks.
