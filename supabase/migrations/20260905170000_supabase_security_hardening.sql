-- Supabase security advisor remediation (2026-09-05).
-- ERROR: six LifeOS views were SECURITY DEFINER (bypass caller RLS).
-- WARN: purge_expired_magnus_chat_messages() was executable by anon/authenticated.

-- ---------------------------------------------------------------------------
-- Views: enforce caller RLS (Postgres 15+ security_invoker)
-- ---------------------------------------------------------------------------
ALTER VIEW public.overdue_tasks SET (security_invoker = true);
ALTER VIEW public.contacts_due SET (security_invoker = true);
ALTER VIEW public.upcoming_occasions SET (security_invoker = true);
ALTER VIEW public.active_deviations SET (security_invoker = true);
ALTER VIEW public.magnus_current_context SET (security_invoker = true);
ALTER VIEW public.suggestable_activities SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Chat retention purge: server-only RPC (service_role / cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_magnus_chat_messages()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH deleted AS (
    DELETE FROM public.magnus_chat_messages
    WHERE created_at < (now() AT TIME ZONE 'utc') - interval '30 days'
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_magnus_chat_messages() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_magnus_chat_messages() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_expired_magnus_chat_messages() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_magnus_chat_messages() TO service_role;

COMMENT ON FUNCTION public.purge_expired_magnus_chat_messages IS
  'Deletes magnus_chat_messages older than 30 days. Callable only by service_role (Magnus server / cron).';
