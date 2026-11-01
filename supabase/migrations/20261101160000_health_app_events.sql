-- Health app telemetry for debugging: what the PWA did (page loads, taps, API calls with
-- timings, JS errors, main-thread hangs) and how long each API route took on the server.
-- Written in batches by the server; read by Claude to root-cause bugs and slowness.
-- Rows older than 30 days are deleted by the server (src/healthApp/events.ts).

CREATE TABLE IF NOT EXISTS public.health_app_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  -- One per page load on the client; the request id on the server.
  session_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  -- page_load | view | tap | api | error | hang | vitals | lifecycle | server_route
  kind TEXT NOT NULL,
  -- What it was about: the view, the button, the API path, the error message.
  name TEXT,
  duration_ms INTEGER,
  status INTEGER,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  app_version TEXT,
  user_agent TEXT,
  -- When it happened on the device (client) or when the request finished (server).
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_app_events_time ON public.health_app_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_app_events_kind_time ON public.health_app_events (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_app_events_session ON public.health_app_events (session_id, occurred_at);

COMMENT ON TABLE public.health_app_events IS 'Health PWA telemetry (client events + server route timings) for debugging. 30-day retention.';

ALTER TABLE public.health_app_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_app_events;
CREATE POLICY service_role_only ON public.health_app_events FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.health_app_events FROM anon, authenticated;
