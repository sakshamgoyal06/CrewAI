-- magnus_events — the master log of intent and outcome.
--
-- One row per thing Saksham said he would do: what it was, which pillar it belongs to, when he
-- planned it, when it actually happened, and how it ended (done, missed, postponed, …).
--
-- Moving a commitment never edits history. The old row keeps its planned time and takes a terminal
-- status ('postponed' or 'preponed'), and a NEW row carries the new time. The two are linked in
-- both directions, and every row in the chain shares `root_event_id`, so "how many times have I
-- moved this?" is one indexed query. Correcting a mistake (wrong time typed) is a plain UPDATE;
-- deciding to do it later is `magnus_reschedule_event()`.
--
-- Apply in the Supabase SQL Editor, or: supabase db push (if using the CLI).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Stable grouping key for a recurring activity ("AI session #2" -> "ai_session_2"), so the same
-- habit logged with slightly different titles still aggregates.
CREATE OR REPLACE FUNCTION public.magnus_slugify(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    LEFT(BTRIM(REGEXP_REPLACE(LOWER(COALESCE(p_text, '')), '[^a-z0-9]+', '_', 'g'), '_'), 60),
    ''
  );
$$;

COMMENT ON FUNCTION public.magnus_slugify(TEXT) IS
  'Lowercase underscore slug used as the default magnus_events.activity_key.';

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.magnus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,

  -- What ---------------------------------------------------------------------
  title TEXT NOT NULL,
  details TEXT,
  pillar TEXT NOT NULL DEFAULT 'general',
  kind TEXT NOT NULL DEFAULT 'event',
  activity_key TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  location TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',

  -- When it was meant to happen ----------------------------------------------
  time_zone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  planned_duration_minutes INTEGER,
  planned_local_date DATE,
  planned_local_time TIME,
  planned_local_dow SMALLINT,

  -- When it actually happened -------------------------------------------------
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_local_date DATE,
  actual_duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::INTEGER
    END
  ) STORED,
  start_delay_minutes INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN started_at IS NOT NULL AND planned_start_at IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (started_at - planned_start_at)) / 60)::INTEGER
    END
  ) STORED,

  -- How it ended ---------------------------------------------------------------
  status TEXT NOT NULL DEFAULT 'planned',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome_note TEXT,
  quality_rating SMALLINT,

  -- The reschedule chain --------------------------------------------------------
  rescheduled_from_event_id UUID REFERENCES public.magnus_events (id) ON DELETE SET NULL,
  rescheduled_to_event_id UUID REFERENCES public.magnus_events (id) ON DELETE SET NULL,
  displaced_by_event_id UUID REFERENCES public.magnus_events (id) ON DELETE SET NULL,
  root_event_id UUID,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  reschedule_reason TEXT,
  original_planned_start_at TIMESTAMPTZ,
  is_latest BOOLEAN GENERATED ALWAYS AS (rescheduled_to_event_id IS NULL) STORED,

  -- Links out --------------------------------------------------------------------
  source TEXT NOT NULL DEFAULT 'telegram',
  calendar_event_id TEXT,
  calendar_id TEXT,
  daily_log_id UUID REFERENCES public.magnus_daily_logs (id) ON DELETE SET NULL,
  goal_id UUID,

  -- Nudging --------------------------------------------------------------------
  reminder_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_magnus_events_title CHECK (BTRIM(title) <> ''),
  CONSTRAINT chk_magnus_events_time_zone CHECK (BTRIM(time_zone) <> ''),
  CONSTRAINT chk_magnus_events_pillar CHECK (
    pillar IN ('health', 'wealth', 'happiness', 'wisdom', 'general')
  ),
  CONSTRAINT chk_magnus_events_kind CHECK (kind IN ('event', 'task', 'habit')),
  CONSTRAINT chk_magnus_events_priority CHECK (
    priority IN ('low', 'normal', 'high', 'critical')
  ),
  CONSTRAINT chk_magnus_events_source CHECK (
    source IN ('telegram', 'magnus', 'calendar', 'journal', 'system', 'import')
  ),
  -- 'postponed' / 'preponed' are terminal on the row that was moved; the replacement is a new row.
  CONSTRAINT chk_magnus_events_status CHECK (
    status IN (
      'planned',
      'in_progress',
      'done',
      'partial',
      'skipped',
      'missed',
      'cancelled',
      'postponed',
      'preponed'
    )
  ),
  CONSTRAINT chk_magnus_events_planned_order CHECK (
    planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at >= planned_start_at
  ),
  CONSTRAINT chk_magnus_events_actual_order CHECK (
    ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at
  ),
  CONSTRAINT chk_magnus_events_planned_duration CHECK (
    planned_duration_minutes IS NULL
    OR (planned_duration_minutes > 0 AND planned_duration_minutes <= 10080)
  ),
  CONSTRAINT chk_magnus_events_quality CHECK (
    quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5
  ),
  CONSTRAINT chk_magnus_events_reschedule_count CHECK (reschedule_count >= 0),
  CONSTRAINT chk_magnus_events_no_self_link CHECK (
    rescheduled_from_event_id IS DISTINCT FROM id
    AND rescheduled_to_event_id IS DISTINCT FROM id
    AND displaced_by_event_id IS DISTINCT FROM id
  ),
  -- A row that has been superseded must say so in its status, so a stale 'planned' row can never
  -- sit in the chain pretending to still be live.
  CONSTRAINT chk_magnus_events_superseded_status CHECK (
    rescheduled_to_event_id IS NULL OR status IN ('postponed', 'preponed', 'cancelled')
  ),
  CONSTRAINT chk_magnus_events_all_day_needs_date CHECK (
    all_day = FALSE OR planned_start_at IS NOT NULL
  )
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_planned
  ON public.magnus_events (user_profile_id, planned_start_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_local_date
  ON public.magnus_events (user_profile_id, planned_local_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_status
  ON public.magnus_events (user_profile_id, status, planned_start_at DESC)
  WHERE deleted_at IS NULL;

-- The hot path: what is still open and coming up (or overdue).
CREATE INDEX IF NOT EXISTS idx_magnus_events_open
  ON public.magnus_events (user_profile_id, planned_start_at)
  WHERE deleted_at IS NULL AND status IN ('planned', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_activity
  ON public.magnus_events (user_profile_id, activity_key, planned_start_at DESC)
  WHERE activity_key IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_magnus_events_user_pillar
  ON public.magnus_events (user_profile_id, pillar, planned_start_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_magnus_events_root
  ON public.magnus_events (root_event_id, reschedule_count);

CREATE INDEX IF NOT EXISTS idx_magnus_events_daily_log
  ON public.magnus_events (daily_log_id)
  WHERE daily_log_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_magnus_events_tags
  ON public.magnus_events USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_magnus_events_reminder_due
  ON public.magnus_events (reminder_at)
  WHERE reminder_at IS NOT NULL
    AND reminder_sent_at IS NULL
    AND deleted_at IS NULL
    AND status = 'planned';

-- A row can be superseded once and can supersede one row: the chain stays a line, not a tree.
CREATE UNIQUE INDEX IF NOT EXISTS uq_magnus_events_chain_predecessor
  ON public.magnus_events (rescheduled_from_event_id)
  WHERE rescheduled_from_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_magnus_events_chain_successor
  ON public.magnus_events (rescheduled_to_event_id)
  WHERE rescheduled_to_event_id IS NOT NULL;

-- One open row per Google Calendar event. Closed rows keep the id for history — Google reuses the
-- same event id when a booking moves, so the whole chain can legitimately carry it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_magnus_events_calendar_event
  ON public.magnus_events (user_profile_id, calendar_event_id)
  WHERE calendar_event_id IS NOT NULL
    AND deleted_at IS NULL
    AND status IN ('planned', 'in_progress');

-- Cheap double-log guard: the same title at the same minute, still open.
CREATE UNIQUE INDEX IF NOT EXISTS uq_magnus_events_open_duplicate
  ON public.magnus_events (user_profile_id, LOWER(BTRIM(title)), planned_start_at)
  WHERE planned_start_at IS NOT NULL
    AND deleted_at IS NULL
    AND status IN ('planned', 'in_progress');

-- ---------------------------------------------------------------------------
-- Normalisation, derived columns, status history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.magnus_events_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_local TIMESTAMP;
  v_entry JSONB;
  v_history JSONB;
  v_overflow INTEGER;
  v_predecessor public.magnus_events%ROWTYPE;
  v_cursor UUID;
  v_hops INTEGER := 0;
BEGIN
  NEW.title := BTRIM(NEW.title);
  NEW.pillar := LOWER(BTRIM(NEW.pillar));
  NEW.kind := LOWER(BTRIM(NEW.kind));
  NEW.status := LOWER(BTRIM(NEW.status));
  NEW.priority := LOWER(BTRIM(NEW.priority));
  NEW.source := LOWER(BTRIM(NEW.source));
  NEW.time_zone := BTRIM(NEW.time_zone);
  NEW.activity_key := COALESCE(
    public.magnus_slugify(NEW.activity_key),
    public.magnus_slugify(NEW.title)
  );
  NEW.root_event_id := COALESCE(NEW.root_event_id, NEW.id);
  NEW.updated_at := now();

  -- An unknown IANA name would otherwise abort the write; fall back rather than lose the event.
  BEGIN
    v_local := NEW.planned_start_at AT TIME ZONE NEW.time_zone;
  EXCEPTION
    WHEN OTHERS THEN
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
        || jsonb_build_object('invalid_time_zone', NEW.time_zone);
      NEW.time_zone := 'UTC';
      v_local := NEW.planned_start_at AT TIME ZONE 'UTC';
  END;

  NEW.planned_local_date := v_local::DATE;
  NEW.planned_local_time := v_local::TIME;
  NEW.planned_local_dow := CASE
    WHEN v_local IS NULL THEN NULL
    ELSE EXTRACT(DOW FROM v_local)::SMALLINT
  END;
  NEW.actual_local_date := (NEW.started_at AT TIME ZONE NEW.time_zone)::DATE;

  -- A stated end always wins: duration exists for plans that only have a start.
  IF NEW.planned_start_at IS NOT NULL
     AND NEW.planned_end_at IS NOT NULL
     AND NEW.planned_end_at > NEW.planned_start_at THEN
    NEW.planned_duration_minutes := GREATEST(
      1,
      (EXTRACT(EPOCH FROM (NEW.planned_end_at - NEW.planned_start_at)) / 60)::INTEGER
    );
  END IF;

  -- Chain sanity: same owner, and no loop back onto this row.
  IF NEW.rescheduled_from_event_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.rescheduled_from_event_id IS DISTINCT FROM OLD.rescheduled_from_event_id) THEN
    SELECT * INTO v_predecessor
      FROM public.magnus_events
      WHERE id = NEW.rescheduled_from_event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'magnus_events: rescheduled_from_event_id % does not exist',
        NEW.rescheduled_from_event_id;
    END IF;
    IF v_predecessor.user_profile_id <> NEW.user_profile_id THEN
      RAISE EXCEPTION 'magnus_events: cannot link a reschedule across users';
    END IF;
    v_cursor := v_predecessor.rescheduled_from_event_id;
    WHILE v_cursor IS NOT NULL AND v_hops < 100 LOOP
      IF v_cursor = NEW.id THEN
        RAISE EXCEPTION 'magnus_events: reschedule chain would form a cycle';
      END IF;
      SELECT rescheduled_from_event_id INTO v_cursor
        FROM public.magnus_events
        WHERE id = v_cursor;
      v_hops := v_hops + 1;
    END LOOP;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
    NEW.status_history := jsonb_build_array(
      jsonb_build_object(
        'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'from', NULL,
        'to', NEW.status,
        'note', NULLIF(BTRIM(COALESCE(NEW.outcome_note, '')), '')
      )
    );
  ELSE
    IF NEW.user_profile_id <> OLD.user_profile_id THEN
      RAISE EXCEPTION 'magnus_events: user_profile_id is immutable';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.root_event_id := COALESCE(OLD.root_event_id, NEW.root_event_id);

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_changed_at := now();
      v_entry := jsonb_build_object(
        'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'from', OLD.status,
        'to', NEW.status,
        'note', NULLIF(
          BTRIM(COALESCE(
            CASE WHEN NEW.outcome_note IS DISTINCT FROM OLD.outcome_note THEN NEW.outcome_note END,
            CASE
              WHEN NEW.reschedule_reason IS DISTINCT FROM OLD.reschedule_reason
                THEN NEW.reschedule_reason
            END,
            ''
          )),
          ''
        )
      );
      v_history := COALESCE(OLD.status_history, '[]'::jsonb) || jsonb_build_array(v_entry);
      v_overflow := jsonb_array_length(v_history) - 50;
      IF v_overflow > 0 THEN
        SELECT COALESCE(jsonb_agg(e ORDER BY n), '[]'::jsonb)
          INTO v_history
          FROM jsonb_array_elements(v_history) WITH ORDINALITY AS t(e, n)
          WHERE n > v_overflow;
      END IF;
      NEW.status_history := v_history;
    ELSE
      NEW.status_history := COALESCE(OLD.status_history, '[]'::jsonb);
      NEW.status_changed_at := OLD.status_changed_at;
    END IF;
  END IF;

  -- Timestamps that follow from the status, so callers only have to say what happened.
  IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
    NEW.actual_local_date := (NEW.started_at AT TIME ZONE NEW.time_zone)::DATE;
  END IF;

  IF NEW.status IN ('done', 'partial') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status IN ('planned', 'in_progress') THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_magnus_events_before_write ON public.magnus_events;
CREATE TRIGGER tr_magnus_events_before_write
  BEFORE INSERT OR UPDATE ON public.magnus_events
  FOR EACH ROW EXECUTE FUNCTION public.magnus_events_before_write();

-- Closing the loop from the other side: whoever writes the replacement row, the row it replaces is
-- marked and back-linked here. That keeps `is_latest` and the chain honest even for a write that
-- did not go through magnus_reschedule_event().
CREATE OR REPLACE FUNCTION public.magnus_events_after_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old public.magnus_events%ROWTYPE;
  v_direction TEXT;
BEGIN
  SELECT * INTO v_old FROM public.magnus_events WHERE id = NEW.rescheduled_from_event_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_direction := CASE
    WHEN v_old.planned_start_at IS NOT NULL
         AND NEW.planned_start_at IS NOT NULL
         AND NEW.planned_start_at < v_old.planned_start_at
      THEN 'preponed'
    ELSE 'postponed'
  END;

  UPDATE public.magnus_events
    SET rescheduled_to_event_id = NEW.id,
        status = CASE WHEN status IN ('planned', 'in_progress') THEN v_direction ELSE status END
    WHERE id = v_old.id
      AND rescheduled_to_event_id IS DISTINCT FROM NEW.id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_magnus_events_after_link ON public.magnus_events;
CREATE TRIGGER tr_magnus_events_after_link
  AFTER INSERT OR UPDATE OF rescheduled_from_event_id ON public.magnus_events
  FOR EACH ROW
  WHEN (NEW.rescheduled_from_event_id IS NOT NULL)
  EXECUTE FUNCTION public.magnus_events_after_link();

-- ---------------------------------------------------------------------------
-- Rescheduling: one call, both rows, no half-written chain
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.magnus_reschedule_event(
  p_event_id UUID,
  p_new_start TIMESTAMPTZ,
  p_new_end TIMESTAMPTZ DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_displaced_by_event_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_old public.magnus_events%ROWTYPE;
  v_new_id UUID := gen_random_uuid();
  v_new_end TIMESTAMPTZ := p_new_end;
  v_direction TEXT;
  v_reminder TIMESTAMPTZ;
BEGIN
  IF p_new_start IS NULL THEN
    RAISE EXCEPTION 'magnus_reschedule_event: a new start time is required';
  END IF;

  SELECT * INTO v_old FROM public.magnus_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'magnus_reschedule_event: event % not found', p_event_id;
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'magnus_reschedule_event: event % is deleted', p_event_id;
  END IF;
  IF v_old.rescheduled_to_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'magnus_reschedule_event: event % was already moved to %',
      p_event_id, v_old.rescheduled_to_event_id;
  END IF;
  IF v_old.status IN ('done', 'partial') THEN
    RAISE EXCEPTION 'magnus_reschedule_event: event % is already %', p_event_id, v_old.status;
  END IF;
  IF v_old.planned_start_at IS NOT NULL AND p_new_start = v_old.planned_start_at THEN
    RAISE EXCEPTION 'magnus_reschedule_event: new start equals the current planned time';
  END IF;

  -- Earlier is a prepone; later (or "it had no time and now it does") is a postpone.
  v_direction := CASE
    WHEN v_old.planned_start_at IS NOT NULL AND p_new_start < v_old.planned_start_at
      THEN 'preponed'
    ELSE 'postponed'
  END;

  -- Keep the original length when only a new start is given.
  IF v_new_end IS NULL
     AND v_old.planned_start_at IS NOT NULL
     AND v_old.planned_end_at IS NOT NULL THEN
    v_new_end := p_new_start + (v_old.planned_end_at - v_old.planned_start_at);
  ELSIF v_new_end IS NULL AND v_old.planned_duration_minutes IS NOT NULL THEN
    v_new_end := p_new_start + make_interval(mins => v_old.planned_duration_minutes);
  END IF;

  -- Carry the reminder lead time across rather than dropping the nudge.
  IF v_old.reminder_at IS NOT NULL AND v_old.planned_start_at IS NOT NULL THEN
    v_reminder := p_new_start - (v_old.planned_start_at - v_old.reminder_at);
  END IF;

  -- Close the old row first: it drops out of the "one open row per calendar event" index before
  -- the replacement claims that id, and tr_magnus_events_after_link fills in the forward link once
  -- the new row exists.
  UPDATE public.magnus_events
    SET status = v_direction,
        reschedule_reason = COALESCE(p_reason, reschedule_reason),
        displaced_by_event_id = COALESCE(p_displaced_by_event_id, displaced_by_event_id)
    WHERE id = v_old.id;

  INSERT INTO public.magnus_events (
    id,
    user_profile_id,
    title,
    details,
    pillar,
    kind,
    activity_key,
    tags,
    location,
    priority,
    time_zone,
    all_day,
    planned_start_at,
    planned_end_at,
    planned_duration_minutes,
    status,
    rescheduled_from_event_id,
    displaced_by_event_id,
    root_event_id,
    reschedule_count,
    reschedule_reason,
    original_planned_start_at,
    source,
    calendar_event_id,
    calendar_id,
    goal_id,
    reminder_at,
    metadata
  ) VALUES (
    v_new_id,
    v_old.user_profile_id,
    v_old.title,
    v_old.details,
    v_old.pillar,
    v_old.kind,
    v_old.activity_key,
    v_old.tags,
    v_old.location,
    v_old.priority,
    v_old.time_zone,
    v_old.all_day,
    p_new_start,
    v_new_end,
    v_old.planned_duration_minutes,
    'planned',
    v_old.id,
    p_displaced_by_event_id,
    COALESCE(v_old.root_event_id, v_old.id),
    v_old.reschedule_count + 1,
    p_reason,
    COALESCE(v_old.original_planned_start_at, v_old.planned_start_at),
    v_old.source,
    v_old.calendar_event_id,
    v_old.calendar_id,
    v_old.goal_id,
    v_reminder,
    COALESCE(v_old.metadata, '{}'::jsonb)
  );

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.magnus_reschedule_event(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) IS
  'Closes an event as postponed/preponed and opens its replacement, linked both ways. Returns the new event id.';

-- Sweeps open events whose time has passed. Run from the morning brief / a cron so "missed" is a
-- fact in the table rather than something the model has to infer from a stale 'planned' row.
CREATE OR REPLACE FUNCTION public.magnus_mark_missed_events(
  p_user_profile_id UUID DEFAULT NULL,
  p_grace INTERVAL DEFAULT INTERVAL '2 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.magnus_events
    SET status = 'missed'
    WHERE deleted_at IS NULL
      AND status = 'planned'
      AND planned_start_at IS NOT NULL
      AND (p_user_profile_id IS NULL OR user_profile_id = p_user_profile_id)
      AND CASE
            WHEN all_day THEN planned_start_at + INTERVAL '1 day'
            ELSE COALESCE(
              planned_end_at,
              planned_start_at + make_interval(mins => COALESCE(planned_duration_minutes, 0))
            )
          END < now() - p_grace;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.magnus_mark_missed_events(UUID, INTERVAL) IS
  'Marks still-planned events whose time has passed as missed. Returns the row count.';

-- ---------------------------------------------------------------------------
-- Per-activity behaviour, computed in the database so the model reads a small table
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.magnus_activity_stats
WITH (security_invoker = on) AS
  SELECT
    user_profile_id,
    activity_key,
    pillar,
    MIN(title) AS sample_title,
    COUNT(*) FILTER (WHERE reschedule_count = 0) AS times_planned,
    COUNT(*) FILTER (WHERE status IN ('done', 'partial')) AS times_done,
    COUNT(*) FILTER (WHERE status = 'missed') AS times_missed,
    COUNT(*) FILTER (WHERE status = 'skipped') AS times_skipped,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS times_cancelled,
    COUNT(*) FILTER (WHERE status = 'postponed') AS times_postponed,
    COUNT(*) FILTER (WHERE status = 'preponed') AS times_preponed,
    ROUND(AVG(start_delay_minutes)) AS avg_start_delay_minutes,
    ROUND(AVG(actual_duration_minutes)) AS avg_actual_duration_minutes,
    ROUND(AVG(quality_rating), 2) AS avg_quality_rating,
    MODE() WITHIN GROUP (ORDER BY planned_local_time) AS usual_local_time,
    MODE() WITHIN GROUP (ORDER BY planned_local_dow) AS usual_local_dow,
    MAX(planned_start_at) AS last_planned_at,
    MAX(completed_at) AS last_done_at
  FROM public.magnus_events
  WHERE deleted_at IS NULL AND activity_key IS NOT NULL
  GROUP BY user_profile_id, activity_key, pillar;

COMMENT ON VIEW public.magnus_activity_stats IS
  'Per-activity completion, slippage and timing, aggregated from magnus_events.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.magnus_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.magnus_events;
CREATE POLICY service_role_only ON public.magnus_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.magnus_events IS
  'Master log of planned and completed activity: intent, outcome, and the reschedule chain between them.';
COMMENT ON COLUMN public.magnus_events.activity_key IS
  'Slug grouping the same recurring activity across rows (defaults to a slug of the title).';
COMMENT ON COLUMN public.magnus_events.kind IS 'event = time block, task = to-do, habit = recurring intent.';
COMMENT ON COLUMN public.magnus_events.time_zone IS
  'IANA zone the planned wall-clock time was expressed in; drives the local_* columns.';
COMMENT ON COLUMN public.magnus_events.planned_local_date IS 'Trigger-maintained: planned_start_at rendered in time_zone.';
COMMENT ON COLUMN public.magnus_events.planned_local_dow IS 'Trigger-maintained day of week, 0 = Sunday.';
COMMENT ON COLUMN public.magnus_events.start_delay_minutes IS
  'started_at minus planned_start_at; negative means early.';
COMMENT ON COLUMN public.magnus_events.status_history IS
  'Append-only trail of status changes (last 50), maintained by trigger.';
COMMENT ON COLUMN public.magnus_events.rescheduled_from_event_id IS
  'The earlier row this one replaces — set on the NEW event after a postpone/prepone.';
COMMENT ON COLUMN public.magnus_events.rescheduled_to_event_id IS
  'The later row that replaced this one — set on the OLD event. NULL means this is the live row.';
COMMENT ON COLUMN public.magnus_events.displaced_by_event_id IS
  'The other event this one was moved for, when something took its slot.';
COMMENT ON COLUMN public.magnus_events.root_event_id IS
  'First event of the reschedule chain; equal to id for a first-time plan.';
COMMENT ON COLUMN public.magnus_events.original_planned_start_at IS
  'Planned start of the first row in the chain, so total drift is one column away.';
COMMENT ON COLUMN public.magnus_events.is_latest IS
  'True when nothing has superseded this row: the live end of its chain.';
COMMENT ON COLUMN public.magnus_events.daily_log_id IS
  'Journal entry this event is reflected in (magnus_daily_logs).';
COMMENT ON COLUMN public.magnus_events.deleted_at IS
  'Soft delete: rows are kept so reschedule chains and history stay intact.';
