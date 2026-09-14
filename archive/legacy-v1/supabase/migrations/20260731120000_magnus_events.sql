-- Magnus event log: the master table for what the user plans to do and what actually happened.
--
-- One row per commitment. Moving a commitment never edits the original row — the original is closed
-- as `postponed` / `preponed` / `rescheduled` and a fresh row is inserted pointing back at it, so the
-- history of "planned 21:00, moved twice, finally done at 23:40" survives intact and is queryable.
--
-- Apply in the Supabase SQL Editor, or: supabase db push.

CREATE TABLE IF NOT EXISTS public.magnus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,

  -- What
  title TEXT NOT NULL,
  details TEXT,
  pillar TEXT NOT NULL DEFAULT 'magnus',
  -- Stable slug for the same recurring thing ('ai_session', 'gym', 'reading') so rhythm and
  -- adherence can be measured across differently-worded titles.
  activity_key TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  -- 1 highest .. 5 lowest.
  priority SMALLINT,

  -- Intent (when it was meant to happen)
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  planned_minutes INTEGER,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  -- Local-time projections, maintained by trigger: grouping by day and "when do I usually do this".
  planned_date DATE,
  planned_minute_of_day SMALLINT,
  planned_dow SMALLINT,

  -- Reality (when it actually happened)
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  actual_minutes INTEGER,
  completed_at TIMESTAMPTZ,
  start_delay_minutes NUMERIC GENERATED ALWAYS AS (
    round((EXTRACT(EPOCH FROM (started_at - planned_start_at)) / 60.0)::numeric)
  ) STORED,

  -- State
  status TEXT NOT NULL DEFAULT 'planned',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Append-only trail of {status, at, reason}, capped at the last 50 transitions.
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Why it moved, was skipped or was missed — the raw material for coaching.
  reason TEXT,
  -- How it went, in the user's words.
  outcome_note TEXT,

  -- Reschedule chain
  -- Every row in one chain shares `root_event_id` (the first row's id).
  root_event_id UUID NOT NULL,
  -- The row this one replaces.
  reschedule_of UUID REFERENCES public.magnus_events (id) ON DELETE SET NULL,
  -- The row that replaced this one. Maintained by trigger from the successor's `reschedule_of`.
  rescheduled_to UUID REFERENCES public.magnus_events (id) ON DELETE SET NULL,
  reschedule_kind TEXT,
  -- 0 for the original, 1 for the first move, and so on.
  reschedule_count INTEGER NOT NULL DEFAULT 0,

  -- Reminders
  remind_at TIMESTAMPTZ,
  reminded_at TIMESTAMPTZ,

  -- Links out
  google_event_id TEXT,
  google_calendar_id TEXT,
  daily_log_id UUID REFERENCES public.magnus_daily_logs (id) ON DELETE SET NULL,
  -- Free-form links to other systems: {"hevy_workout_id": "...", "meal_log_id": "..."}.
  external_refs JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance
  source TEXT NOT NULL DEFAULT 'telegram',
  created_by TEXT NOT NULL DEFAULT 'user',
  -- Set by a caller that may retry; makes a repeated write a no-op instead of a duplicate row.
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_magnus_events_title CHECK (length(btrim(title)) > 0),
  CONSTRAINT chk_magnus_events_pillar CHECK (
    pillar IN ('health', 'wealth', 'wisdom', 'joy', 'magnus')
  ),
  CONSTRAINT chk_magnus_events_status CHECK (
    status IN (
      'planned',
      'in_progress',
      'done',
      'partial',
      'skipped',
      'missed',
      'postponed',
      'preponed',
      'rescheduled',
      'cancelled'
    )
  ),
  CONSTRAINT chk_magnus_events_reschedule_kind CHECK (
    reschedule_kind IS NULL OR reschedule_kind IN ('postponed', 'preponed', 'rescheduled')
  ),
  CONSTRAINT chk_magnus_events_source CHECK (
    source IN ('telegram', 'calendar_sync', 'morning_brief', 'system', 'api', 'script')
  ),
  CONSTRAINT chk_magnus_events_created_by CHECK (created_by IN ('user', 'magnus', 'system')),
  CONSTRAINT chk_magnus_events_priority CHECK (priority IS NULL OR priority BETWEEN 1 AND 5),
  CONSTRAINT chk_magnus_events_planned_order CHECK (
    planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at >= planned_start_at
  ),
  CONSTRAINT chk_magnus_events_actual_order CHECK (
    ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at
  ),
  CONSTRAINT chk_magnus_events_planned_minutes CHECK (
    planned_minutes IS NULL OR (planned_minutes >= 0 AND planned_minutes <= 7 * 24 * 60)
  ),
  CONSTRAINT chk_magnus_events_actual_minutes CHECK (
    actual_minutes IS NULL OR (actual_minutes >= 0 AND actual_minutes <= 7 * 24 * 60)
  ),
  -- A row cannot supersede or be superseded by itself.
  CONSTRAINT chk_magnus_events_no_self_reschedule CHECK (
    reschedule_of IS DISTINCT FROM id AND rescheduled_to IS DISTINCT FROM id
  ),
  -- A superseded row must name its replacement, so a chain can never dead-end silently.
  CONSTRAINT chk_magnus_events_superseded_has_successor CHECK (
    status NOT IN ('postponed', 'preponed', 'rescheduled') OR rescheduled_to IS NOT NULL
  ),
  -- Anything that came from a move must say how it moved.
  CONSTRAINT chk_magnus_events_successor_has_kind CHECK (
    reschedule_of IS NULL OR reschedule_kind IS NOT NULL
  )
);

-- One successor per predecessor: a commitment cannot be moved into two futures.
CREATE UNIQUE INDEX IF NOT EXISTS uq_magnus_events_reschedule_of
  ON public.magnus_events (reschedule_of)
  WHERE reschedule_of IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_magnus_events_idempotency
  ON public.magnus_events (user_profile_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- A Google event maps to at most one live row; superseded rows keep the id for history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_magnus_events_google_live
  ON public.magnus_events (user_profile_id, google_event_id)
  WHERE google_event_id IS NOT NULL
    AND status NOT IN ('postponed', 'preponed', 'rescheduled', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_planned
  ON public.magnus_events (user_profile_id, planned_start_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_status_planned
  ON public.magnus_events (user_profile_id, status, planned_start_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_date
  ON public.magnus_events (user_profile_id, planned_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_activity
  ON public.magnus_events (user_profile_id, activity_key, planned_start_at DESC NULLS LAST)
  WHERE activity_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_pillar
  ON public.magnus_events (user_profile_id, pillar, planned_start_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_magnus_events_root
  ON public.magnus_events (root_event_id, reschedule_count);

CREATE INDEX IF NOT EXISTS idx_magnus_events_due_reminders
  ON public.magnus_events (remind_at)
  WHERE remind_at IS NOT NULL AND reminded_at IS NULL AND status IN ('planned', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_magnus_events_daily_log
  ON public.magnus_events (daily_log_id)
  WHERE daily_log_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Derived columns and the status trail
-- ---------------------------------------------------------------------------

-- Local-time projection. An unknown IANA name would abort the write, so fall back to UTC instead.
CREATE OR REPLACE FUNCTION public.magnus_events_local_parts(
  p_at TIMESTAMPTZ,
  p_time_zone TEXT
)
RETURNS TIMESTAMP
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_at IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN p_at AT TIME ZONE COALESCE(NULLIF(btrim(p_time_zone), ''), 'UTC');
  EXCEPTION
    WHEN OTHERS THEN
      RETURN p_at AT TIME ZONE 'UTC';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.magnus_events_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_local TIMESTAMP;
  v_entry JSONB;
  v_history JSONB;
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.time_zone := COALESCE(NULLIF(btrim(NEW.time_zone), ''), 'UTC');
  NEW.activity_key := NULLIF(btrim(lower(COALESCE(NEW.activity_key, ''))), '');
  NEW.updated_at := now();

  -- Chain identity. A successor inherits the root and counts one step further along.
  IF TG_OP = 'INSERT' THEN
    IF NEW.reschedule_of IS NOT NULL THEN
      SELECT p.root_event_id, p.reschedule_count + 1
        INTO NEW.root_event_id, NEW.reschedule_count
        FROM public.magnus_events p
       WHERE p.id = NEW.reschedule_of;
    END IF;
    NEW.root_event_id := COALESCE(NEW.root_event_id, NEW.id);
  ELSE
    -- The chain is history; it is not editable after the fact.
    NEW.root_event_id := OLD.root_event_id;
    NEW.reschedule_of := OLD.reschedule_of;
    NEW.reschedule_count := OLD.reschedule_count;
  END IF;

  -- All-day events are anchored to the local day, not to a minute of it.
  IF NEW.all_day THEN
    NEW.planned_minutes := NULL;
  END IF;

  v_local := public.magnus_events_local_parts(NEW.planned_start_at, NEW.time_zone);
  IF v_local IS NULL THEN
    NEW.planned_date := NULL;
    NEW.planned_minute_of_day := NULL;
    NEW.planned_dow := NULL;
  ELSE
    NEW.planned_date := v_local::date;
    NEW.planned_minute_of_day := CASE
      WHEN NEW.all_day THEN NULL
      ELSE (EXTRACT(HOUR FROM v_local) * 60 + EXTRACT(MINUTE FROM v_local))::smallint
    END;
    NEW.planned_dow := EXTRACT(DOW FROM v_local)::smallint;
  END IF;

  IF NEW.planned_start_at IS NOT NULL AND NEW.planned_end_at IS NOT NULL THEN
    NEW.planned_minutes := GREATEST(
      0,
      round(EXTRACT(EPOCH FROM (NEW.planned_end_at - NEW.planned_start_at)) / 60.0)::integer
    );
  ELSIF NEW.planned_start_at IS NOT NULL
        AND NEW.planned_minutes IS NOT NULL
        AND NEW.planned_end_at IS NULL
        AND NOT NEW.all_day THEN
    NEW.planned_end_at := NEW.planned_start_at + make_interval(mins => NEW.planned_minutes);
  END IF;

  IF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    NEW.actual_minutes := GREATEST(
      0,
      round(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0)::integer
    );
  END IF;

  -- Completion timestamp follows the status, in both directions, so a correction cannot leave a
  -- "finished at" on something that is no longer finished.
  IF NEW.status IN ('done', 'partial') THEN
    NEW.completed_at := COALESCE(NEW.ended_at, NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;

  IF NEW.status <> 'planned' THEN
    NEW.remind_at := CASE WHEN NEW.status = 'in_progress' THEN NEW.remind_at ELSE NULL END;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    v_entry := jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'status', NEW.status,
          'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'reason', NULLIF(btrim(COALESCE(NEW.reason, '')), ''),
          'planned_start_at', NEW.planned_start_at
        )
      )
    );
    v_history := CASE WHEN TG_OP = 'INSERT' THEN '[]'::jsonb ELSE COALESCE(OLD.status_history, '[]'::jsonb) END;
    NEW.status_history := (
      WITH combined AS (
        SELECT e, ord
          FROM jsonb_array_elements(v_history || v_entry) WITH ORDINALITY AS t(e, ord)
      ), trimmed AS (
        SELECT e, ord FROM combined ORDER BY ord DESC LIMIT 50
      )
      SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb) FROM trimmed
    );
  ELSE
    NEW.status_history := OLD.status_history;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_magnus_events_before_write ON public.magnus_events;
CREATE TRIGGER tr_magnus_events_before_write
  BEFORE INSERT OR UPDATE ON public.magnus_events
  FOR EACH ROW EXECUTE FUNCTION public.magnus_events_before_write();

-- Keep the back-pointer in step: inserting a successor marks its predecessor as replaced.
CREATE OR REPLACE FUNCTION public.magnus_events_link_predecessor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reschedule_of IS NOT NULL THEN
    UPDATE public.magnus_events
       SET rescheduled_to = NEW.id
     WHERE id = NEW.reschedule_of
       AND rescheduled_to IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_magnus_events_link_predecessor ON public.magnus_events;
CREATE TRIGGER tr_magnus_events_link_predecessor
  AFTER INSERT ON public.magnus_events
  FOR EACH ROW EXECUTE FUNCTION public.magnus_events_link_predecessor();

-- ---------------------------------------------------------------------------
-- Moving a commitment
-- ---------------------------------------------------------------------------

-- Closes the old row and opens its replacement in one transaction, so a failure halfway cannot
-- leave a commitment either duplicated or lost. A NULL `p_new_start` is legitimate: "push it, I do
-- not know when yet" produces an unscheduled successor rather than a dangling postponement.
CREATE OR REPLACE FUNCTION public.magnus_reschedule_event(
  p_event_id UUID,
  p_new_start TIMESTAMPTZ DEFAULT NULL,
  p_new_end TIMESTAMPTZ DEFAULT NULL,
  p_kind TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_details TEXT DEFAULT NULL,
  p_time_zone TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL
)
RETURNS public.magnus_events
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.magnus_events;
  v_new public.magnus_events;
  v_kind TEXT;
  v_minutes INTEGER;
  v_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_old FROM public.magnus_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % not found', p_event_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_old.rescheduled_to IS NOT NULL THEN
    RAISE EXCEPTION 'event % was already moved to %', p_event_id, v_old.rescheduled_to
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_old.status IN ('done', 'partial') THEN
    RAISE EXCEPTION 'event % is already complete and cannot be moved', p_event_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_old.status = 'cancelled' THEN
    RAISE EXCEPTION 'event % was cancelled; create a new one instead', p_event_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_kind := NULLIF(btrim(lower(COALESCE(p_kind, ''))), '');
  IF v_kind IS NULL THEN
    v_kind := CASE
      WHEN p_new_start IS NULL OR v_old.planned_start_at IS NULL THEN 'postponed'
      WHEN p_new_start < v_old.planned_start_at THEN 'preponed'
      WHEN p_new_start > v_old.planned_start_at THEN 'postponed'
      ELSE 'rescheduled'
    END;
  END IF;
  IF v_kind NOT IN ('postponed', 'preponed', 'rescheduled') THEN
    RAISE EXCEPTION 'unknown reschedule kind %', p_kind USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Carry the original duration across the move unless a new end is given.
  v_end := p_new_end;
  v_minutes := v_old.planned_minutes;
  IF v_end IS NULL AND p_new_start IS NOT NULL AND v_minutes IS NOT NULL AND NOT v_old.all_day THEN
    v_end := p_new_start + make_interval(mins => v_minutes);
  END IF;

  -- The Google event id moves to the successor only after the old row is closed: while both rows
  -- are live they would collide on the one-live-row-per-calendar-event index.
  INSERT INTO public.magnus_events (
    user_profile_id, title, details, pillar, activity_key, tags, priority,
    time_zone, planned_start_at, planned_end_at, planned_minutes, all_day,
    status, root_event_id, reschedule_of, reschedule_kind,
    google_calendar_id, external_refs,
    source, created_by, metadata
  ) VALUES (
    v_old.user_profile_id,
    v_old.title,
    COALESCE(NULLIF(btrim(COALESCE(p_details, '')), ''), v_old.details),
    v_old.pillar,
    v_old.activity_key,
    v_old.tags,
    v_old.priority,
    COALESCE(NULLIF(btrim(COALESCE(p_time_zone, '')), ''), v_old.time_zone),
    p_new_start,
    v_end,
    v_minutes,
    v_old.all_day,
    'planned',
    v_old.root_event_id,
    v_old.id,
    v_kind,
    v_old.google_calendar_id,
    v_old.external_refs,
    COALESCE(NULLIF(btrim(COALESCE(p_source, '')), ''), v_old.source),
    v_old.created_by,
    v_old.metadata
  )
  RETURNING * INTO v_new;

  UPDATE public.magnus_events
     SET status = v_kind,
         reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), reason),
         rescheduled_to = v_new.id
   WHERE id = v_old.id;

  IF v_old.google_event_id IS NOT NULL THEN
    UPDATE public.magnus_events
       SET google_event_id = v_old.google_event_id
     WHERE id = v_new.id
    RETURNING * INTO v_new;
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.magnus_reschedule_event IS
  'Atomically closes an event as postponed/preponed/rescheduled and inserts its replacement, linked both ways.';

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

-- Anything still `planned` well after its time never happened. Runs from the morning brief; the
-- grace window keeps a session that is merely running late from being written off, and the age
-- window keeps a long silence from rewriting months of history in one go.
CREATE OR REPLACE FUNCTION public.magnus_sweep_missed_events(
  p_user_profile_id UUID,
  p_grace_minutes INTEGER DEFAULT 180,
  p_max_age_days INTEGER DEFAULT 14
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH swept AS (
    UPDATE public.magnus_events
       SET status = 'missed'
     WHERE user_profile_id = p_user_profile_id
       AND status IN ('planned', 'in_progress')
       AND planned_start_at IS NOT NULL
       AND rescheduled_to IS NULL
       AND COALESCE(planned_end_at, planned_start_at)
             < now() - make_interval(mins => GREATEST(p_grace_minutes, 0))
       AND planned_start_at > now() - make_interval(days => GREATEST(p_max_age_days, 1))
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM swept;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.magnus_sweep_missed_events IS
  'Marks stale planned/in-progress events as missed once they are past their time by the grace window.';

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.magnus_events_open
WITH (security_invoker = true) AS
SELECT
  e.*,
  (
    e.planned_start_at IS NOT NULL
    AND COALESCE(e.planned_end_at, e.planned_start_at) < now()
  ) AS is_overdue
FROM public.magnus_events e
WHERE e.status IN ('planned', 'in_progress');

COMMENT ON VIEW public.magnus_events_open IS
  'Commitments still open (planned or in progress), with an overdue flag.';

-- Per-activity rhythm and adherence: how often it is done, how late it usually starts, how often it
-- slips. This is what turns the log into advice.
CREATE OR REPLACE VIEW public.magnus_event_activity_stats
WITH (security_invoker = true) AS
SELECT
  user_profile_id,
  pillar,
  COALESCE(activity_key, lower(title)) AS activity,
  count(*)::integer AS total,
  count(*) FILTER (WHERE status = 'done')::integer AS done_count,
  count(*) FILTER (WHERE status = 'partial')::integer AS partial_count,
  count(*) FILTER (WHERE status = 'missed')::integer AS missed_count,
  count(*) FILTER (WHERE status = 'skipped')::integer AS skipped_count,
  count(*) FILTER (WHERE status = 'cancelled')::integer AS cancelled_count,
  count(*) FILTER (WHERE status IN ('postponed', 'preponed', 'rescheduled'))::integer AS moved_count,
  count(*) FILTER (WHERE status = 'postponed')::integer AS postponed_count,
  count(*) FILTER (WHERE status = 'preponed')::integer AS preponed_count,
  round(avg(planned_minute_of_day)) AS avg_planned_minute_of_day,
  round(avg(start_delay_minutes)) AS avg_start_delay_minutes,
  round(avg(actual_minutes)) AS avg_actual_minutes,
  max(completed_at) AS last_completed_at,
  max(planned_start_at) AS last_planned_at
FROM public.magnus_events
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.magnus_event_activity_stats IS
  'Per-activity adherence: completion, misses, moves, typical planned time of day and start delay.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

ALTER TABLE public.magnus_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.magnus_events;
CREATE POLICY service_role_only ON public.magnus_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON FUNCTION public.magnus_reschedule_event(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.magnus_reschedule_event(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.magnus_sweep_missed_events(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.magnus_sweep_missed_events(UUID, INTEGER, INTEGER) TO service_role;

COMMENT ON TABLE public.magnus_events IS
  'Master event log: planned and completed activity, one row per commitment, moves kept as a linked chain.';
COMMENT ON COLUMN public.magnus_events.activity_key IS
  'Stable slug for the same recurring activity, used for rhythm and adherence analysis.';
COMMENT ON COLUMN public.magnus_events.root_event_id IS
  'First event in the reschedule chain; equals id for an event that has never moved.';
COMMENT ON COLUMN public.magnus_events.reschedule_of IS
  'The event this row replaces (the one that was postponed or preponed).';
COMMENT ON COLUMN public.magnus_events.rescheduled_to IS
  'The event that replaced this row after it was postponed or preponed.';
COMMENT ON COLUMN public.magnus_events.status_history IS
  'Last 50 status transitions as {status, at, reason, planned_start_at}.';
