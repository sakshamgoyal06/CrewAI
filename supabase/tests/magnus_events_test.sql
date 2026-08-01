-- Self-test for the magnus_events schema.
--
-- Runs against a throwaway Postgres, not the Supabase project: it creates stand-ins for
-- `auth.role()`, `user_profile` and `magnus_daily_logs`, applies the migration, and asserts the
-- behaviour the application relies on (chain integrity, derived columns, status history, the
-- reschedule RPC and the missed sweep). Every assertion aborts the script on failure.
--
--   createdb magnus_test
--   psql -d magnus_test -v ON_ERROR_STOP=1 \
--     -f supabase/tests/magnus_events_test.sql \
--     -f supabase/migrations/20260801120000_magnus_events.sql \
--     -c 'SELECT public.magnus_events_selftest();'
--
-- The file is split that way on purpose: load this first for the scaffolding, then the migration,
-- then call the test function.

-- The test function references magnus_events, which the migration creates after this file loads.
SET check_function_bodies = off;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT 'service_role'::TEXT;
$$;

CREATE TABLE IF NOT EXISTS public.user_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata'
);

CREATE TABLE IF NOT EXISTS public.magnus_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  body TEXT NOT NULL
);

-- Returns true when the statement fails for the expected reason, so "this must be rejected" reads
-- as an assertion. Pinning the message keeps a test from passing because of an unrelated error.
CREATE OR REPLACE FUNCTION public.magnus_test_rejects(p_sql TEXT, p_because TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%' || p_because || '%' THEN
        RETURN TRUE;
      END IF;
      RAISE EXCEPTION 'expected a failure mentioning "%", got: %', p_because, SQLERRM;
  END;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.magnus_events_selftest()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  u1 UUID;
  u2 UUID;
  e1 UUID;
  e2 UUID;
  e3 UUID;
  other UUID;
  log_id UUID;
  row1 public.magnus_events%ROWTYPE;
  row2 public.magnus_events%ROWTYPE;
  n INTEGER;
  stats RECORD;
BEGIN
  DELETE FROM public.user_profile;

  INSERT INTO public.user_profile (telegram_chat_id) VALUES ('tester-1') RETURNING id INTO u1;
  INSERT INTO public.user_profile (telegram_chat_id) VALUES ('tester-2') RETURNING id INTO u2;
  INSERT INTO public.magnus_daily_logs (user_profile_id, log_date, body)
    VALUES (u1, CURRENT_DATE, 'journal') RETURNING id INTO log_id;

  ---------------------------------------------------------------------------
  -- 1. Insert derives everything the caller did not have to supply
  ---------------------------------------------------------------------------
  INSERT INTO public.magnus_events (
    user_profile_id, title, details, pillar, time_zone,
    planned_start_at, planned_end_at, reminder_at, daily_log_id
  ) VALUES (
    u1, '  AI Session  ', 'Deep work on Magnus', 'wisdom', 'Asia/Kolkata',
    TIMESTAMPTZ '2026-08-01 21:00+05:30', TIMESTAMPTZ '2026-08-01 22:30+05:30',
    TIMESTAMPTZ '2026-08-01 20:45+05:30', log_id
  ) RETURNING id INTO e1;

  SELECT * INTO row1 FROM public.magnus_events WHERE id = e1;
  ASSERT row1.title = 'AI Session', 'title should be trimmed';
  ASSERT row1.activity_key = 'ai_session', 'activity_key should slug the title, got ' || COALESCE(row1.activity_key, 'NULL');
  ASSERT row1.planned_local_date = DATE '2026-08-01', 'planned_local_date should be the local day';
  ASSERT row1.planned_local_time = TIME '21:00', 'planned_local_time should be the local wall clock';
  ASSERT row1.planned_local_dow = 6, 'planned_local_dow should be Saturday (6)';
  ASSERT row1.planned_duration_minutes = 90, 'duration should be derived from start/end';
  ASSERT row1.root_event_id = e1, 'a first-time plan is its own chain root';
  ASSERT row1.is_latest, 'a fresh row is the live end of its chain';
  ASSERT row1.reschedule_count = 0, 'a fresh row has not been moved';
  ASSERT jsonb_array_length(row1.status_history) = 1, 'insert seeds one history entry';
  ASSERT row1.status_history -> 0 ->> 'to' = 'planned', 'history should record the opening status';
  ASSERT row1.kind = 'event' AND row1.priority = 'normal' AND row1.source = 'telegram',
    'defaults should apply';

  ---------------------------------------------------------------------------
  -- 2. A bad timezone degrades to UTC instead of losing the event
  ---------------------------------------------------------------------------
  INSERT INTO public.magnus_events (user_profile_id, title, time_zone, planned_start_at)
    VALUES (u1, 'Bad zone', 'Mars/Olympus', TIMESTAMPTZ '2026-08-02 10:00+00')
    RETURNING id INTO other;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT row1.time_zone = 'UTC', 'unknown zone should fall back to UTC';
  ASSERT row1.metadata ->> 'invalid_time_zone' = 'Mars/Olympus', 'the bad zone should be recorded';
  ASSERT row1.planned_local_time = TIME '10:00', 'local time should be computed in the fallback zone';
  DELETE FROM public.magnus_events WHERE id = other;

  -- …including when only the actual times are known, which is a different code path.
  INSERT INTO public.magnus_events (user_profile_id, title, time_zone, status, started_at)
    VALUES (u1, 'Bad zone, done', 'Mars/Olympus', 'done', TIMESTAMPTZ '2026-08-02 10:00+00')
    RETURNING id INTO other;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT row1.actual_local_date = DATE '2026-08-02', 'actual_local_date survives an unknown zone';
  DELETE FROM public.magnus_events WHERE id = other;

  ---------------------------------------------------------------------------
  -- 3. Status transitions maintain their own timestamps and history
  ---------------------------------------------------------------------------
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, planned_end_at)
    VALUES (u1, 'Gym', TIMESTAMPTZ '2026-08-01 07:00+05:30', TIMESTAMPTZ '2026-08-01 08:00+05:30')
    RETURNING id INTO other;

  UPDATE public.magnus_events SET status = 'in_progress' WHERE id = other;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT row1.started_at IS NOT NULL, 'in_progress should stamp started_at';
  ASSERT row1.completed_at IS NULL, 'in_progress is not complete';

  UPDATE public.magnus_events
    SET status = 'done',
        started_at = TIMESTAMPTZ '2026-08-01 07:20+05:30',
        ended_at = TIMESTAMPTZ '2026-08-01 08:05+05:30',
        outcome_note = 'Late but done',
        quality_rating = 4
    WHERE id = other;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT row1.completed_at IS NOT NULL, 'done should stamp completed_at';
  ASSERT row1.actual_duration_minutes = 45, 'actual duration should come from start/end';
  ASSERT row1.start_delay_minutes = 20, 'start delay should be signed minutes vs the plan';
  ASSERT row1.actual_local_date = DATE '2026-08-01', 'actual_local_date should follow started_at';
  ASSERT jsonb_array_length(row1.status_history) = 3, 'each status change appends one entry';
  ASSERT row1.status_history -> 2 ->> 'note' = 'Late but done', 'the note rides along with the change';

  -- Reopening clears the completion stamp rather than leaving a lie behind.
  UPDATE public.magnus_events SET status = 'planned' WHERE id = other;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT row1.completed_at IS NULL, 'reopening should clear completed_at';

  -- Editing something other than the status leaves the trail alone.
  n := jsonb_array_length(row1.status_history);
  UPDATE public.magnus_events SET details = 'edited' WHERE id = other;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT jsonb_array_length(row1.status_history) = n, 'a non-status edit adds no history';
  DELETE FROM public.magnus_events WHERE id = other;

  ---------------------------------------------------------------------------
  -- 4. Postponing: old row closed, new row opened, linked both ways
  ---------------------------------------------------------------------------
  SELECT public.magnus_reschedule_event(
    e1, TIMESTAMPTZ '2026-08-01 23:00+05:30', NULL, 'Dinner ran long'
  ) INTO e2;

  SELECT * INTO row1 FROM public.magnus_events WHERE id = e1;
  SELECT * INTO row2 FROM public.magnus_events WHERE id = e2;
  ASSERT row1.status = 'postponed', 'a later time closes the old row as postponed';
  ASSERT row1.rescheduled_to_event_id = e2, 'the old row points forward';
  ASSERT NOT row1.is_latest, 'the old row is no longer live';
  ASSERT row1.planned_start_at = TIMESTAMPTZ '2026-08-01 21:00+05:30', 'history keeps the original time';
  ASSERT row2.status = 'planned', 'the replacement opens as planned';
  ASSERT row2.rescheduled_from_event_id = e1, 'the new row points back';
  ASSERT row2.root_event_id = e1, 'the chain shares a root';
  ASSERT row2.reschedule_count = 1, 'the move is counted';
  ASSERT row2.original_planned_start_at = TIMESTAMPTZ '2026-08-01 21:00+05:30',
    'the first intended time is carried forward';
  ASSERT row2.planned_end_at = TIMESTAMPTZ '2026-08-02 00:30+05:30', 'the 90 minute length is preserved';
  ASSERT row2.reminder_at = TIMESTAMPTZ '2026-08-01 22:45+05:30', 'the 15 minute reminder lead is preserved';
  ASSERT row2.reschedule_reason = 'Dinner ran long', 'the reason lands on the new row';
  ASSERT row2.details = row1.details AND row2.pillar = row1.pillar AND row2.activity_key = row1.activity_key,
    'the replacement inherits what it is';

  ---------------------------------------------------------------------------
  -- 5. Preponing is detected by direction, and chains keep extending
  ---------------------------------------------------------------------------
  SELECT public.magnus_reschedule_event(e2, TIMESTAMPTZ '2026-08-01 22:00+05:30') INTO e3;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = e2;
  SELECT * INTO row2 FROM public.magnus_events WHERE id = e3;
  ASSERT row1.status = 'preponed', 'an earlier time closes the old row as preponed';
  ASSERT row2.reschedule_count = 2, 'moves accumulate along the chain';
  ASSERT row2.root_event_id = e1, 'the root stays the first event';
  ASSERT row2.original_planned_start_at = TIMESTAMPTZ '2026-08-01 21:00+05:30',
    'drift is measured from the first plan, not the previous one';

  SELECT COUNT(*) INTO n FROM public.magnus_events WHERE root_event_id = e1;
  ASSERT n = 3, 'the whole chain is one indexed query';

  ---------------------------------------------------------------------------
  -- 6. The chain cannot fork, loop, cross users, or be moved twice
  ---------------------------------------------------------------------------
  ASSERT public.magnus_test_rejects(FORMAT(
    'SELECT public.magnus_reschedule_event(%L, TIMESTAMPTZ ''2026-08-03 09:00+05:30'')', e1),
    'was already moved'),
    'an already superseded event cannot be moved again';

  ASSERT public.magnus_test_rejects(FORMAT(
    'SELECT public.magnus_reschedule_event(%L, %L)', e3, row2.planned_start_at),
    'equals the current planned time'),
    'moving to the same time is not a move';

  ASSERT public.magnus_test_rejects(
    'SELECT public.magnus_reschedule_event(''00000000-0000-0000-0000-000000000000'', now())',
    'not found'),
    'a missing event is an error, not a silent no-op';

  ASSERT public.magnus_test_rejects(FORMAT(
    'SELECT public.magnus_reschedule_event(%L, NULL)', e3),
    'new start time is required'),
    'a move needs a destination';

  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, rescheduled_from_event_id)
     VALUES (%L, ''Fork'', %L)', u1, e1),
    'uq_magnus_events_chain_predecessor'),
    'a superseded row cannot gain a second successor';

  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, rescheduled_from_event_id)
     VALUES (%L, ''Cross user'', %L)', u2, e3),
    'across users'),
    'chains cannot cross users';

  ASSERT public.magnus_test_rejects(FORMAT(
    'UPDATE public.magnus_events SET rescheduled_from_event_id = %L WHERE id = %L', e1, e1),
    'chk_magnus_events_no_self_link'),
    'a row cannot supersede itself';

  ASSERT public.magnus_test_rejects(FORMAT(
    'UPDATE public.magnus_events SET rescheduled_to_event_id = %L WHERE id = %L', e1, e3),
    'chk_magnus_events_superseded_status'),
    'a live row cannot be marked superseded while still planned';

  ASSERT public.magnus_test_rejects(FORMAT(
    'UPDATE public.magnus_events SET user_profile_id = %L WHERE id = %L', u2, e3),
    'user_profile_id is immutable'),
    'ownership is immutable';

  -- A cycle: point the chain root back at the current tail.
  ASSERT public.magnus_test_rejects(FORMAT(
    'UPDATE public.magnus_events SET status = ''postponed'', rescheduled_from_event_id = %L
     WHERE id = %L', e3, e1),
    'cycle'),
    'a reschedule chain cannot form a cycle';

  ASSERT public.magnus_test_rejects(FORMAT(
    'UPDATE public.magnus_events SET rescheduled_from_event_id =
       ''00000000-0000-0000-0000-000000000000'' WHERE id = %L', e3),
    'does not exist'),
    'a chain cannot point at a row that is not there';

  UPDATE public.magnus_events SET status = 'done' WHERE id = e3;
  ASSERT public.magnus_test_rejects(FORMAT(
    'SELECT public.magnus_reschedule_event(%L, TIMESTAMPTZ ''2026-08-04 09:00+05:30'')', e3),
    'is already done'),
    'something already done cannot be postponed';
  UPDATE public.magnus_events SET status = 'planned' WHERE id = e3;

  ---------------------------------------------------------------------------
  -- 7. Duplicate guards
  ---------------------------------------------------------------------------
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at)
     VALUES (%L, ''ai session'', TIMESTAMPTZ ''2026-08-01 22:00+05:30'')', u1),
    'uq_magnus_events_open_duplicate'),
    'the same open plan at the same minute is a double log';

  -- …but the superseded rows in the chain do not block a fresh plan at their old time.
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at)
    VALUES (u1, 'AI Session', TIMESTAMPTZ '2026-08-01 21:00+05:30') RETURNING id INTO other;
  DELETE FROM public.magnus_events WHERE id = other;

  UPDATE public.magnus_events SET calendar_event_id = 'gcal_1' WHERE id = e3;
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, calendar_event_id)
     VALUES (%L, ''Clash'', ''gcal_1'')', u1),
    'uq_magnus_events_calendar_event'),
    'one open row per calendar event';

  -- The same calendar id may repeat inside a chain, because Google keeps the id when an event moves.
  UPDATE public.magnus_events SET calendar_event_id = 'gcal_1' WHERE id IN (e1, e2);
  SELECT COUNT(*) INTO n FROM public.magnus_events WHERE calendar_event_id = 'gcal_1';
  ASSERT n = 3, 'closed rows may share the calendar id with the open one';

  ---------------------------------------------------------------------------
  -- 8. Column constraints
  ---------------------------------------------------------------------------
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title) VALUES (%L, ''   '')', u1),
    'chk_magnus_events_title'),
    'a blank title is rejected';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, pillar) VALUES (%L, ''X'', ''joy'')', u1),
    'chk_magnus_events_pillar'),
    'pillar is a closed set';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, status) VALUES (%L, ''X'', ''snoozed'')', u1),
    'chk_magnus_events_status'),
    'status is a closed set';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, kind) VALUES (%L, ''X'', ''errand'')', u1),
    'chk_magnus_events_kind'),
    'kind is a closed set';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, source) VALUES (%L, ''X'', ''sms'')', u1),
    'chk_magnus_events_source'),
    'source is a closed set';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, planned_end_at)
     VALUES (%L, ''X'', TIMESTAMPTZ ''2026-08-01 10:00+00'', TIMESTAMPTZ ''2026-08-01 09:00+00'')', u1),
    'chk_magnus_events_planned_order'),
    'an event cannot end before it starts';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, started_at, ended_at)
     VALUES (%L, ''X'', TIMESTAMPTZ ''2026-08-01 10:00+00'', TIMESTAMPTZ ''2026-08-01 09:00+00'')', u1),
    'chk_magnus_events_actual_order'),
    'an event cannot finish before it began';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, quality_rating) VALUES (%L, ''X'', 9)', u1),
    'chk_magnus_events_quality'),
    'quality is 1..5';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, all_day) VALUES (%L, ''X'', TRUE)', u1),
    'chk_magnus_events_all_day_needs_date'),
    'an all-day event needs a day';
  ASSERT public.magnus_test_rejects(FORMAT(
    'INSERT INTO public.magnus_events (user_profile_id, title, planned_duration_minutes)
     VALUES (%L, ''X'', 0)', u1),
    'chk_magnus_events_planned_duration'),
    'a zero-length plan is not a plan';

  ---------------------------------------------------------------------------
  -- 8b. Logging something after the fact, and the displaced-by link
  ---------------------------------------------------------------------------
  INSERT INTO public.magnus_events (
    user_profile_id, title, status, pillar, kind, tags,
    planned_start_at, started_at, ended_at, source
  ) VALUES (
    u1, 'Walk', 'done', 'health', 'habit', ARRAY['outdoors', 'recovery'],
    now() - INTERVAL '2 hours', now() - INTERVAL '2 hours', now() - INTERVAL '90 minutes', 'magnus'
  ) RETURNING id INTO other;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT row1.completed_at IS NOT NULL, 'logging a finished activity stamps completion on insert';
  ASSERT row1.actual_duration_minutes = 30, 'a back-dated log still computes its duration';
  ASSERT row1.status_history -> 0 ->> 'to' = 'done', 'the opening status is whatever it was logged as';
  ASSERT (SELECT COUNT(*) FROM public.magnus_events WHERE tags @> ARRAY['recovery']) = 1,
    'tags are searchable';

  UPDATE public.magnus_events SET displaced_by_event_id = other WHERE id = e3;
  ASSERT (SELECT displaced_by_event_id FROM public.magnus_events WHERE id = e3) = other,
    'an event records what took its slot';
  DELETE FROM public.magnus_events WHERE id = other;
  ASSERT (SELECT displaced_by_event_id FROM public.magnus_events WHERE id = e3) IS NULL,
    'losing the other event does not take this one with it';

  ---------------------------------------------------------------------------
  -- 9. The missed sweep
  ---------------------------------------------------------------------------
  DELETE FROM public.magnus_events WHERE user_profile_id = u1 AND root_event_id <> e1;

  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, planned_end_at)
    VALUES (u1, 'Long overdue', now() - INTERVAL '6 hours', now() - INTERVAL '5 hours');
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, planned_end_at)
    VALUES (u1, 'Only just over', now() - INTERVAL '30 minutes', now() - INTERVAL '10 minutes');
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at)
    VALUES (u1, 'Still ahead', now() + INTERVAL '3 hours');
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, all_day)
    VALUES (u1, 'All day today', date_trunc('day', now()), TRUE);
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, status)
    VALUES (u1, 'Deliberately skipped', now() - INTERVAL '9 hours', 'skipped');
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at)
    VALUES (u2, 'Someone else overdue', now() - INTERVAL '9 hours');

  SELECT public.magnus_mark_missed_events(u1) INTO n;
  ASSERT n = 1, 'only the long overdue event is missed, got ' || n;
  ASSERT (SELECT status FROM public.magnus_events WHERE title = 'Long overdue') = 'missed',
    'the overdue event is marked';
  ASSERT (SELECT status FROM public.magnus_events WHERE title = 'Only just over') = 'planned',
    'the grace window protects a recent overrun';
  ASSERT (SELECT status FROM public.magnus_events WHERE title = 'Still ahead') = 'planned',
    'the future is not missed';
  ASSERT (SELECT status FROM public.magnus_events WHERE title = 'All day today') = 'planned',
    'an all-day event has until the end of the day';
  ASSERT (SELECT status FROM public.magnus_events WHERE title = 'Deliberately skipped') = 'skipped',
    'a decision is not a miss';
  ASSERT (SELECT status FROM public.magnus_events WHERE title = 'Someone else overdue') = 'planned',
    'the sweep is scoped to one user';
  ASSERT jsonb_array_length(
      (SELECT status_history FROM public.magnus_events WHERE title = 'Long overdue')
    ) = 2, 'the sweep is recorded in the history like any other change';

  ---------------------------------------------------------------------------
  -- 10. Soft delete keeps the chain, hard delete of the user does not
  ---------------------------------------------------------------------------
  UPDATE public.magnus_events SET deleted_at = now() WHERE title = 'Only just over';
  SELECT public.magnus_mark_missed_events(u1, INTERVAL '1 minute') INTO n;
  ASSERT (SELECT status FROM public.magnus_events WHERE title = 'Only just over') = 'planned',
    'a soft-deleted event is out of scope';

  ---------------------------------------------------------------------------
  -- 11. The stats view
  ---------------------------------------------------------------------------
  UPDATE public.magnus_events
    SET status = 'done',
        started_at = planned_start_at + INTERVAL '10 minutes',
        ended_at = planned_start_at + INTERVAL '70 minutes',
        quality_rating = 5
    WHERE id = e3;

  SELECT * INTO stats FROM public.magnus_activity_stats
    WHERE user_profile_id = u1 AND activity_key = 'ai_session';
  ASSERT stats.times_planned = 1, 'first-time plans are the denominator, got ' || stats.times_planned;
  ASSERT stats.times_done = 1, 'completions are counted';
  ASSERT stats.times_postponed = 1 AND stats.times_preponed = 1, 'slippage is counted by direction';
  ASSERT stats.avg_start_delay_minutes = 10, 'lateness averages across the activity';
  ASSERT stats.avg_actual_duration_minutes = 60, 'real duration averages across the activity';
  ASSERT stats.avg_quality_rating = 5.00, 'quality averages across the activity';
  ASSERT stats.usual_local_dow = 6, 'the usual day of week is available';

  UPDATE public.magnus_events SET deleted_at = now() WHERE root_event_id = e1;
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.magnus_activity_stats
      WHERE user_profile_id = u1 AND activity_key = 'ai_session'
  ), 'soft-deleted rows are out of the stats';
  UPDATE public.magnus_events SET deleted_at = NULL WHERE root_event_id = e1;

  ---------------------------------------------------------------------------
  -- 11b. A replacement written directly still closes the row it replaces
  ---------------------------------------------------------------------------
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at)
    VALUES (u1, 'Reading', TIMESTAMPTZ '2026-08-05 20:00+05:30') RETURNING id INTO other;
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, rescheduled_from_event_id)
    VALUES (u1, 'Reading', TIMESTAMPTZ '2026-08-05 18:00+05:30', other);
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT row1.status = 'preponed', 'the direction is derived even without the RPC';
  ASSERT row1.rescheduled_to_event_id IS NOT NULL, 'the back-link is filled in by trigger';
  ASSERT NOT row1.is_latest, 'and the row drops out of the live set';
  DELETE FROM public.magnus_events WHERE title = 'Reading';

  ---------------------------------------------------------------------------
  -- 11c. An explicit new end wins over the inherited duration
  ---------------------------------------------------------------------------
  INSERT INTO public.magnus_events (user_profile_id, title, planned_start_at, planned_end_at)
    VALUES (u1, 'Standup', TIMESTAMPTZ '2026-08-06 09:00+05:30', TIMESTAMPTZ '2026-08-06 09:15+05:30')
    RETURNING id INTO other;
  PERFORM public.magnus_reschedule_event(
    other, TIMESTAMPTZ '2026-08-06 11:00+05:30', TIMESTAMPTZ '2026-08-06 12:00+05:30'
  );
  ASSERT (
    SELECT planned_duration_minutes FROM public.magnus_events WHERE rescheduled_from_event_id = other
  ) = 60, 'an explicit end resets the length';
  DELETE FROM public.magnus_events WHERE title = 'Standup';

  ---------------------------------------------------------------------------
  -- 11d. The table is not readable without the service role
  ---------------------------------------------------------------------------
  ASSERT (
    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.magnus_events'::regclass
  ), 'row level security is enabled';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'magnus_events' AND policyname = 'service_role_only'
  ), 'the service_role_only policy is in place';

  ---------------------------------------------------------------------------
  -- 12. History is capped, and the user cascade cleans up
  ---------------------------------------------------------------------------
  INSERT INTO public.magnus_events (user_profile_id, title) VALUES (u1, 'Flip flop')
    RETURNING id INTO other;
  FOR n IN 1..30 LOOP
    UPDATE public.magnus_events SET status = 'in_progress' WHERE id = other;
    UPDATE public.magnus_events SET status = 'planned' WHERE id = other;
  END LOOP;
  SELECT * INTO row1 FROM public.magnus_events WHERE id = other;
  ASSERT jsonb_array_length(row1.status_history) = 50,
    'history is capped at 50, got ' || jsonb_array_length(row1.status_history);
  ASSERT row1.status_history -> 49 ->> 'to' = 'planned', 'the newest entry is last';

  DELETE FROM public.user_profile WHERE id = u1;
  SELECT COUNT(*) INTO n FROM public.magnus_events WHERE user_profile_id = u1;
  ASSERT n = 0, 'events die with the profile';

  DELETE FROM public.user_profile;
  RETURN 'magnus_events self-test passed';
END;
$$;

RESET check_function_bodies;
