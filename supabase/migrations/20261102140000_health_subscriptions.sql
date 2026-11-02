-- Magnus Pro: one subscription row per person, whichever store sold it.
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_profile_id UUID PRIMARY KEY REFERENCES public.user_profile(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('razorpay', 'play', 'manual')),
  provider_subscription_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  -- pending: checkout started; active: paid; past_due: a renewal failed; cancelled: runs to period end.
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_provider_id
  ON public.user_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.user_subscriptions;
CREATE POLICY service_role_only ON public.user_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.user_subscriptions FROM anon, authenticated;
