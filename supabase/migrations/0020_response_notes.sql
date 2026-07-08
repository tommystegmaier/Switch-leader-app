-- ===========================================================================
-- Team Hub Platform — 0020 decline notes on schedule responses
--
-- Volunteers can leave a reason when they decline a week. Adds a note column to
-- schedule_responses, threads it through respond_occurrence, and returns it in
-- roster_status so managers can see why. (Both functions change signature/shape,
-- so drop before recreate to avoid overload/return-type conflicts.)
-- ===========================================================================

alter table public.schedule_responses add column if not exists note text;

drop function if exists public.respond_occurrence(uuid, date, text);
create or replace function public.respond_occurrence(p_role uuid, p_date date, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_status not in ('confirmed','declined') then raise exception 'invalid response'; end if;
  select org_id into v_org from public.schedule_roles where id = p_role;
  if v_org is null then raise exception 'role not found'; end if;
  if not exists (select 1 from public.schedule_roster rr where rr.role_id = p_role and rr.user_id = auth.uid()) then
    raise exception 'you are not scheduled for this role';
  end if;
  insert into public.schedule_responses (org_id, role_id, user_id, serve_date, status, note, responded_at)
  values (v_org, p_role, auth.uid(), p_date, p_status, nullif(trim(coalesce(p_note, '')), ''), now())
  on conflict (role_id, user_id, serve_date)
    do update set status = excluded.status, note = excluded.note, responded_at = now();
end; $$;

drop function if exists public.roster_status(uuid, date);
create or replace function public.roster_status(p_org uuid, p_date date)
returns table (role_id uuid, user_id uuid, status text, note text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view responses';
  end if;
  return query
  select r.role_id, r.user_id, r.status, r.note
  from public.schedule_responses r
  where r.org_id = p_org and r.serve_date = p_date;
end; $$;

revoke all on function public.respond_occurrence(uuid, date, text, text) from public;
revoke all on function public.roster_status(uuid, date) from public;
grant execute on function public.respond_occurrence(uuid, date, text, text) to authenticated;
grant execute on function public.roster_status(uuid, date) to authenticated;
