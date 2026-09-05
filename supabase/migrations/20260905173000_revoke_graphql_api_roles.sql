-- Lock down Supabase Data API / GraphQL schema exposure for anon + authenticated.
-- Magnus server uses service_role only; RLS alone does not hide schema from pg_graphql.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- Keep retention purge callable by the Magnus server (service_role).
GRANT EXECUTE ON FUNCTION public.purge_expired_magnus_chat_messages() TO service_role;

-- Stop re-granting on future DDL from the postgres migration role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON ROUTINES FROM anon, authenticated;
