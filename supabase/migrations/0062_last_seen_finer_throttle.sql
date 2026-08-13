-- ===========================================================================
-- Team Hub Platform — 0062 record "last opened" more promptly
--
-- touch_last_seen only wrote at most once an hour. That's fine for a date-level
-- display, but it means a manager watching someone open the app can see no
-- change for up to an hour, which reads as broken. Five minutes is still cheap
-- (one small UPDATE per person per five minutes at worst) and makes the value
-- reflect reality closely enough to verify by eye.
-- ===========================================================================

create or replace function public.touch_last_seen(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.memberships
     set last_seen_at = now()
   where org_id = p_org
     and user_id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
end;
$$;
revoke all on function public.touch_last_seen(uuid) from public;
grant execute on function public.touch_last_seen(uuid) to authenticated;
