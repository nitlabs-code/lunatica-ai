-- Keep-alive RPC for the daily GitHub Actions ping
-- (.github/workflows/supabase-keepalive.yml).
--
-- Free-tier projects are paused after 7 days without activity. The workflow
-- calls POST /rest/v1/rpc/keepalive with the public anon key once a day. That
-- request goes through PostgREST and runs a real statement in Postgres, and
-- it returns 200 without opening up any table to anon (every table in public
-- stays revoked from anon; see 20260926010000_explicit_grants.sql).
--
-- The function reads no data: it only returns the server clock.
--   * security invoker: runs with the caller's (anon's) privileges.
--   * empty search_path: nothing can be shadowed.
--   * EXECUTE is revoked from everyone, then granted to anon only (the
--     workflow is the only caller). Explicit grants are required: from
--     2026-10-30 Supabase stops auto-granting new objects in public to the
--     API roles, and we don't want to rely on the old default anyway.

create or replace function public.keepalive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

comment on function public.keepalive() is
  'Daily keep-alive ping target (GitHub Actions). Returns now(); reads no data.';

revoke all on function public.keepalive() from public, anon, authenticated, service_role;
grant execute on function public.keepalive() to anon;
