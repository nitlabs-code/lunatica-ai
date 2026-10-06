-- Keep-alive v2: make the daily ping do real table I/O.
--
-- Context: the v1 keepalive() (20260926020000_keepalive_rpc.sql) only returned
-- now(). The GitHub Actions ping succeeded every day, but Supabase still sent
-- an inactivity-pause warning on 2026-10-02, so a statement that touches no
-- table apparently does not count as activity.
--
-- v2 keeps the same RPC name and signature (POST /rest/v1/rpc/keepalive,
-- returns timestamptz), so the workflow needs no change, but each call now
-- reads AND writes a real table:
--
--   private.keepalive_heartbeat: a single-row table (id = 1) holding the time
--   of the last ping and a ping counter. It lives in the `private` schema,
--   which is not exposed through the Data API, and every API role is revoked
--   from it. RLS is enabled with no policies (deny-all) as a second lock.
--
-- Why SECURITY DEFINER (and why it is safe here):
--   * anon must keep ZERO table grants (see 20260926010000_explicit_grants.sql),
--     so a security-invoker function cannot touch any table. The only way to do
--     real I/O without granting anon anything is a definer function.
--   * The function takes no arguments, runs a fixed statement against one
--     fixed row, and returns only a timestamp; it reads/returns no user data.
--   * set search_path = '' and fully qualified names: nothing can be shadowed.
--   * EXECUTE is revoked from everyone and granted to anon only.
--   * Abuse bound: the anon key is public, so anyone can call this. The upsert
--     only writes when the last write is older than 1 minute, so spamming it
--     produces at most ~1 row update per minute (otherwise a PK read).
--   Alternative rejected: a public.keepalive_log table with an anon
--   INSERT/UPDATE grant + RLS policy. That would give anon a table grant and a
--   writable table exposed through the Data API, which we explicitly avoid.

create table if not exists private.keepalive_heartbeat (
  id smallint primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  ping_count bigint not null default 0
);

comment on table private.keepalive_heartbeat is
  'Single-row heartbeat written by public.keepalive() (daily GitHub Actions ping).';

alter table private.keepalive_heartbeat enable row level security;
revoke all on table private.keepalive_heartbeat from public, anon, authenticated, service_role;

-- Seed with an old timestamp so the very first ping already writes.
insert into private.keepalive_heartbeat (id, pinged_at, ping_count)
values (1, 'epoch', 0)
on conflict (id) do nothing;

create or replace function public.keepalive()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  last_ping timestamptz;
begin
  insert into private.keepalive_heartbeat as h (id, pinged_at, ping_count)
  values (1, now(), 1)
  on conflict (id) do update
    set pinged_at = excluded.pinged_at,
        ping_count = h.ping_count + 1
    where h.pinged_at < now() - interval '1 minute';

  select h.pinged_at into last_ping
  from private.keepalive_heartbeat as h
  where h.id = 1;

  return last_ping;
end;
$$;

comment on function public.keepalive() is
  'Daily keep-alive ping target (GitHub Actions). Upserts the single row in private.keepalive_heartbeat (at most once a minute) and returns its timestamp; reads no user data.';

revoke all on function public.keepalive() from public, anon, authenticated, service_role;
grant execute on function public.keepalive() to anon;
