# Magnus Health PWA — plan

Started 2026-10-27. Goal: turn Magnus into an installable web app for the **health pillar only**: log and create Hevy workouts, track steps and walks, make sure meals and calories get logged, organize the day around the plan, keep one north-star number, nudge with notifications, and explain (RCA) why the plan isn't being followed.

## Architecture

**Front end.** A small static PWA in `pwa/` (plain HTML/CSS/JS, no build step), served by the existing Express server at `/app`. Manifest + service worker make it installable on the home screen and let the shell open offline. API calls always hit the network.

**Back end.** No new service. The same Node process that runs the Telegram bot gets a JSON API under `/api/health` (`src/healthApp/`). It reuses what is already built:

| Need | Reused code |
|---|---|
| Hevy read/write | `src/pillars/health/workouts/hevy/*` (client, per-user key in `user_integrations`) |
| Meals + calories | `estimateMealNutrition` → `recordMealSession` → `meal_logs` (parked in Telegram minimal mode, but the code and tables are live) |
| Targets | `user_health_profile` (calorie/protein targets exist; this adds step target + training days) |
| Day planning | Google Calendar integration (`src/integrations/googleCalendar`, `magnus_events`) |
| Scheduled nudges | proactive engine (`src/proactive/*`: cron, dedupe, guards, rhythm kinds) |

**Auth.** Single-user app: one long random token (`MAGNUS_HEALTH_APP_TOKEN`) mapped to one `user_profile` (`MAGNUS_HEALTH_APP_USER_PROFILE_ID`). The PWA stores it on the device; phone automations send the same header. Can move to Supabase Auth magic links later if anyone else ever uses it.

**Steps data.** A web app cannot read Apple Health or Health Connect, so steps are pushed in:

- **iPhone:** an iOS Shortcuts personal automation (a few times a day + 9 pm) runs *Find Health Samples → Steps, today → sum* and POSTs `{steps, walkMinutes, source: "ios_shortcut"}` to `/api/health/steps`. Free, ~5 minutes to set up. The paid *Health Auto Export* app does the same on a schedule with less fiddling.
- **Android:** Health Connect has no web API and the Google Fit REST API is being retired, so it needs a helper (Tasker / an HTTP-shortcut app reading Health Connect) or manual entry.
- **Manual entry** in the app always works.

The endpoint upserts one row per local day (`health_daily_activity`), latest total wins, so repeated pushes are safe.

**Notifications.** Web Push with VAPID keys (`web-push` package), a `push_subscriptions` table, and a push sender next to the existing Telegram outbound so the proactive engine can target either. iPhone needs iOS 16.4+ and the app added to the Home Screen; Android/desktop Chrome work directly.

## North-star metric

**On-track days in the last 7** (goal: 5/7).

A day is on-track when every check that applies to it is met:

1. **Meals logged**: at least 3 meal entries (logging is the habit that makes everything else measurable).
2. **Calories in range**: between 60% and 100% of the daily target (below 60% reads as under-logging, not discipline).
3. **Protein**: at or above target (only if a target is set).
4. **Steps**: at or above the step target (default 8,000).
5. **Workout**: logged in Hevy, *only on planned training days*.

Why this one: it's a leading indicator you control every day (weight and body fat lag by weeks), it rolls workouts, steps and food into one number, a missed day shows *which* check failed so the RCA has something concrete to work on, and a rolling 7-day window means one bad day doesn't reset a streak. The today view also shows a 0–100 score (mean progress across checks) so the day has a visible "how close am I".

The outcome goal (e.g. weight by a date) still matters: it sets the calorie/protein/step targets the checks score against, and gets reviewed weekly.

## Phases

1. **Foundation (this PR).** `/api/health` (today snapshot, meal log, steps ingest), `health_daily_activity` table + step target/training days, deterministic north-star scoring, installable PWA with today view, meal and steps logging, recent Hevy workouts.
2. **Notifications.** Web Push subscribe flow, push channel in the proactive engine, first nudges: morning plan, meal-not-logged at meal times, step pace check mid-afternoon, training-day workout reminder, evening score wrap. Quiet hours and one-nudge-per-check-per-day dedupe.
3. **Workouts + day planner.** Today's planned session from the weekly schedule, start-in-Hevy link, log a workout and create routines from the app (existing `createHevyWorkout` / `createHevyRoutine` / Hevy write agent). "Plan my day": propose workout, walk and meal blocks into free Google Calendar gaps, write them on confirm.
4. **RCA.** Deterministic signal mining over 14–28 days (misses by check, weekday, time of day, calendar load, late/skipped meals, sleep if available), then Claude writes one short hypothesis + one small experiment. Triggered on two off-track days in a row or a week below goal, plus a weekly review. Store RCAs and whether the experiment helped so later ones learn.
5. **Polish.** Settings screen for targets and training days, trends (4–12 weeks), offline queue for logs, decide whether Telegram stays as a second front door.

## Open questions

- iPhone or Android? Decides the steps pipeline and notification setup.
- The outcome goal and current targets: calories, protein, steps, training days.
- Keep the Telegram bot running alongside, or replace it?
- Meals are parked in production minimal mode. The PWA meal endpoint uses the estimator chain directly; confirm the provider keys (USDA / CalorieNinjas) and web-search cost are fine.

## Housekeeping

`.env` is tracked in git and holds a real Hevy API key. Rotate the key in Hevy; removing the file from git history is a separate cleanup.
