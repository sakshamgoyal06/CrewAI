-- Per-user proactive message subscriptions (evening journal, drift guard, custom reminders, …).

CREATE TABLE IF NOT EXISTS public.magnus_proactive_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('one_shot', 'recurring', 'conditional')),
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_instruction TEXT,
  source TEXT NOT NULL DEFAULT 'user_chat' CHECK (source IN ('system_default', 'user_chat')),
  cap_bucket TEXT NOT NULL DEFAULT 'scheduled' CHECK (cap_bucket IN ('scheduled', 'user_asked', 'adaptive')),
  cooldown_hours INTEGER,
  last_sent_at TIMESTAMPTZ,
  next_fire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS magnus_proactive_subscriptions_user_enabled_idx
  ON public.magnus_proactive_subscriptions (user_profile_id)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS magnus_proactive_subscriptions_next_fire_idx
  ON public.magnus_proactive_subscriptions (next_fire_at)
  WHERE enabled = TRUE AND next_fire_at IS NOT NULL;

-- One row per catalog kind per user (evening_journal, drift_guard, …).
CREATE UNIQUE INDEX IF NOT EXISTS magnus_proactive_subscriptions_singleton_kind_idx
  ON public.magnus_proactive_subscriptions (user_profile_id, kind)
  WHERE kind IN ('evening_journal', 'drift_guard', 'midday_encouragement');

ALTER TABLE public.magnus_proactive_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY magnus_proactive_subscriptions_service_role_only
  ON public.magnus_proactive_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
