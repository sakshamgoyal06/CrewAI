-- Web Push subscriptions, a sent-notification log (dedupe), notification settings, and
-- root-cause analysis reports with the experiment each one suggests.

CREATE TABLE IF NOT EXISTS public.health_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  failures SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.health_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  delivered SMALLINT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_notifications UNIQUE (user_profile_id, dedupe_key)
);

ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.user_health_profile.notification_prefs IS 'Health app: {"quietStart":"22:00","quietEnd":"07:00","off":["kind",...]}';

CREATE TABLE IF NOT EXISTS public.health_rca_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('off_track_streak', 'weekly_review', 'manual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  hypothesis TEXT NOT NULL,
  experiment TEXT NOT NULL,
  -- Which check the experiment should move, and its hit rate before it started.
  target_check TEXT,
  baseline_rate NUMERIC,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'trying', 'declined', 'helped', 'no_change')),
  outcome JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_health_rca_reports_user ON public.health_rca_reports (user_profile_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['health_push_subscriptions', 'health_notifications', 'health_rca_reports'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY service_role_only ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      t
    );
  END LOOP;
END $$;
