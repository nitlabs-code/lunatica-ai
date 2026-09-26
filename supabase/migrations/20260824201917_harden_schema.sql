-- The platform event trigger keeps RLS enabled on newly created public tables.
-- It does not need to be callable through the Data API.
-- Guarded so fresh replays (supabase db reset, local, preview branches) don't
-- fail where the platform function doesn't exist.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- The Edge Function uses service_role, which bypasses RLS. Client roles remain
-- explicitly denied even if table grants are changed accidentally in the future.
create policy "rate_limits_deny_client_access"
on public.rate_limits for all
to authenticated
using (false)
with check (false);

-- Covers the composite ownership foreign key and deletion checks efficiently.
create index messages_conversation_owner_idx
on public.messages (conversation_id, user_id);
