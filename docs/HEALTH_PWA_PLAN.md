# Magnus Health PWA: plan

Started 2026-10-27. Magnus is now one product: an installable web app for the **health pillar only**. It logs and creates Hevy workouts, tracks steps and walks, makes sure meals and calories get logged, organizes the day around the plan, keeps one north-star number, nudges with notifications, and explains (RCA) why the plan isn't being followed.

## Decisions (2026-10-27)

- **Phone:** Android. Steps, walks and scale readings come from Health Connect through the HC Webhook app.
- **Goal model:** an outcome goal (target weight, body fat %, and/or muscle mass by a deadline), tracked by **weekly weigh-ins**. Daily tracking is the consistency metric that drives it.
- **Telegram bot:** off and staying off. Everything not needed by the app is in `archive/` with a note (`archive/README.md`).
- **Meals:** logged in the app through estimate → editable draft → confirm. Must be robust and tested.
- **UI:** a considered, premium look, not default styling. **Chat is the home page**; the tracker is the second page. Both can log, with the tracker as the secondary entry point.

## Architecture

**Front end.** Static PWA in `pwa/` (plain HTML/CSS/JS, no build step), served at `/app`. Manifest + service worker (shell cached, API always network). Two tabs: **Coach** (chat, home) and **Tracker**. Bottom sheets for quick logging and goal/targets.

Design language: warm near-black (light mode: warm paper), one gold accent, editorial serif (Instrument Serif) for numbers and headings over a tight grotesk (Inter Tight), hairline borders, a floating glass tab bar. The north star is a 7-segment ring; goal metrics show progress, required vs actual weekly pace, a pace tag and a trend sparkline.

**Back end.** One Node process (`src/index.ts` → `src/healthServer.ts`) with a JSON API at `/api/health` (`src/healthApp/`). Every write goes through `src/healthApp/actions.ts` with one zod schema per action, so a log from chat and a log from the tracker are the same row.

| Need | Code |
|---|---|
| Coach chat | `chat.ts`: Claude (`claude-opus-5-5`, server-side refusal fallback on) with tools: `get_status`, `draft_meal`, `delete_meal`, `log_steps`, `log_body_checkin`, `set_goal`, `set_daily_targets`. History in `health_chat_messages`. |
| Meals | `meals.ts`: estimator chain (web search → USDA → CalorieNinjas → optional LLM) → editable draft; confirm saves exactly the confirmed items into `meal_logs`; draft id = `meal_session_id`, so retries never double-log; soft delete. |
| Goal + weigh-ins | `goalProgress.ts` (pure), `bodyStore.ts`; tables `health_goals` (one active), `health_body_checkins` (one per day). |
| Steps / walks | `healthConnect.ts`: hourly buckets upserted into `health_activity_samples`, day totals rebuilt into `health_daily_activity`. Manual entry via `/steps`. |
| North star | `northStar.ts` (pure). |
| Hevy | `src/pillars/health/workouts/hevy/` (client, per-user key). Read-only in the app so far. |
| Gym slot check | `workoutCheck.ts`: in-process timer every 5 min. On training days, `gym_time` + delay (default 3 h) → read Hevy; if nothing, post a check card in chat. Answers (skipped + reason, trained but unlogged) go in `health_workout_checks` for RCA; "trained, unlogged" counts as the day's workout. |

**Auth.** Single user: `MAGNUS_HEALTH_APP_TOKEN` (bearer) mapped to `MAGNUS_HEALTH_APP_USER_PROFILE_ID`. `npm run app:setup` prints both.

## North-star metric

**On-track days in the last 7** (goal: 5/7). A day is on-track when every check that applies is met:

1. **Meals logged**: at least 3.
2. **Calories in range**: 60–100% of the daily target (under 60% reads as under-logging).
3. **Protein**: at or above target.
4. **Steps**: at or above target (default 8,000).
5. **Workout** in Hevy, only on planned training days.

It's a leading indicator you control every day; weight and body fat lag by weeks. The outcome goal sets the targets and is read weekly: each metric shows where it is, the pace needed to hit the deadline, the actual 4-week trend, and when the trend lands.

## Phases

1. **Foundation (PR #114).** Everything above: API, coach chat, robust meals, goals + weigh-ins, north star, Health Connect sync, the app, archive.
2. **Notifications.** Web Push (VAPID, `push_subscriptions`), scheduler reusing `archive/src/proactive` ideas (dedupe, quiet hours). First nudges: morning plan, meal not logged by slot time, mid-afternoon step pace, training-day workout reminder, evening score wrap, Sunday weigh-in.
3. **Workouts + day planner.** Log a workout and create routines from chat and tracker (bring back `hevyWriteAgent`), today's planned session from training days. "Plan my day": workout, walk and meal blocks into free Google Calendar time on confirm.
4. **RCA.** Deterministic signal mining over 14–28 days (which check fails, which weekdays, time of day, late or skipped meals, calendar load), then Claude writes one hypothesis and one small experiment. Triggered by two off-track days in a row or a week below goal, plus a weekly review. Store RCAs and whether the experiment helped.
5. **Polish.** Trends (4–12 weeks), offline queue for logs, photo meal logging, settings for check-in day and quiet hours.

## Housekeeping

`.env` is tracked in git and holds a real Hevy API key. Rotate it in Hevy; purging it from git history is a separate cleanup.
