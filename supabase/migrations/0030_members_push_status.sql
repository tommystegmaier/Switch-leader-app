-- ===========================================================================
-- Team Hub Platform — 0030 Which members have notifications turned on
--
-- push_subscriptions has no SELECT policy (only the server reads it to send).
-- This manager-only function returns the set of member user_ids that have at
-- least one push subscription in the workspace, so Settings → People with
-- access can show a live green/red "notifications on?" tag per person.
-- ===========================================================================

create or replace function public.members_with_push(p_org uuid)
returns table (user_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can view this';
  end if;
  return query
  select distinct ps.user_id
  from public.push_subscriptions ps
  where ps.org_id = p_org and ps.user_id is not null;
end;
$$;

revoke all on function public.members_with_push(uuid) from public;
grant execute on function public.members_with_push(uuid) to authenticated;
