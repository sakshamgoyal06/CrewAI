-- When a commitment moves, carry its reminder forward by the same delta as planned_start_at.

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
AS $$
DECLARE
  v_old public.magnus_events%ROWTYPE;
  v_new public.magnus_events%ROWTYPE;
  v_kind TEXT;
  v_end TIMESTAMPTZ;
  v_minutes INTEGER;
  v_remind TIMESTAMPTZ;
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

  v_kind := NULLIF(btrim(COALESCE(p_kind, '')), '');
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

  v_end := p_new_end;
  v_minutes := v_old.planned_minutes;
  IF v_end IS NULL AND p_new_start IS NOT NULL AND v_minutes IS NOT NULL AND NOT v_old.all_day THEN
    v_end := p_new_start + make_interval(mins => v_minutes);
  END IF;

  v_remind := v_old.remind_at;
  IF v_remind IS NOT NULL THEN
    IF p_new_start IS NOT NULL AND v_old.planned_start_at IS NOT NULL THEN
      v_remind := v_remind + (p_new_start - v_old.planned_start_at);
    ELSIF p_new_start IS NULL THEN
      v_remind := NULL;
    END IF;
  END IF;

  INSERT INTO public.magnus_events (
    user_profile_id, title, details, pillar, activity_key, tags, priority,
    time_zone, planned_start_at, planned_end_at, planned_minutes, all_day,
    status, root_event_id, reschedule_of, reschedule_kind,
    remind_at, reminded_at,
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
    v_remind,
    NULL,
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
  'Atomically closes an event as postponed/preponed/rescheduled and inserts its replacement, linked both ways. Carries remind_at by the same delta as planned_start_at.';
