-- ===========================================================================
-- Switch Leader App — 0081 birthdays: whose, and say which
--
-- Students already appear in the birthday list and always have — they are in
-- memberships, and sign-up writes their birthday — but nothing said which
-- entries were students. A list mixing a 45-year-old volunteer and a 12-year-old
-- with no way to tell them apart is not much use to a leader reading it.
--
-- So: every entry now says which side of the app the person is on, and the
-- feature can be set to leaders only, students only, or both. The setting
-- covers the card AND the daily notification — one switch, not two that can
-- disagree.
--
-- A student's birthday is read from student_profiles rather than the account
-- metadata. Both are written at sign-up, but a Youth Pastor correcting a
-- birthday later updates student_profiles, so that is the copy to trust.
-- ===========================================================================

alter table public.birthday_config
  add column if not exists audience text not null default 'everyone';

alter table public.birthday_config drop constraint if exists birthday_config_audience_check;
alter table public.birthday_config add constraint birthday_config_audience_check
  check (audience in ('everyone','leaders','students'));

-- --- which birthdays, for whoever is asking -------------------------------
-- Filtered here rather than in the app: with the feature set to leaders only,
-- a student's birthday should not be sent to a phone at all, not sent and then
-- hidden.
drop function if exists public.org_birthdays(uuid);
create or replace function public.org_birthdays(p_org uuid)
returns table (user_id uuid, name text, email text, phone text, birthday text, role text, is_student boolean)
language plpgsql security definer set search_path = public as $$
declare v_audience text;
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view birthdays';
  end if;
  select coalesce(bc.audience, 'everyone') into v_audience
    from public.birthday_config bc where bc.org_id = p_org;
  v_audience := coalesce(v_audience, 'everyone');

  return query
  select m.user_id,
         coalesce(
           sp.full_name,
           nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',
                                u.raw_user_meta_data->>'name','')),'')),
         u.email::text,
         coalesce(sp.phone, nullif(trim(coalesce(u.raw_user_meta_data->>'phone','')),'')),
         -- A student's own record wins: it is what a leader edits.
         coalesce(sp.birthday::text,
                  nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'')),
         m.role,
         m.role = 'student'
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.student_profiles sp on sp.user_id = m.user_id and sp.org_id = m.org_id
  where m.org_id = p_org
    and coalesce(sp.birthday::text,
                 nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'')) is not null
    and case v_audience
          when 'leaders'  then m.role <> 'student'
          when 'students' then m.role = 'student'
          else true
        end;
end; $$;
revoke all on function public.org_birthdays(uuid) from public;
grant execute on function public.org_birthdays(uuid) to authenticated;

-- --- the same list for the daily notification -----------------------------
-- The cron sends this; it has to obey the same setting, or turning the card
-- down to leaders only would still push a student's birthday to everyone.
drop function if exists public.org_birthdays_all(uuid);
create or replace function public.org_birthdays_all(p_org uuid)
returns table (user_id uuid, name text, birthday text, is_student boolean)
language plpgsql security definer set search_path = public as $$
declare v_audience text;
begin
  select coalesce(bc.audience, 'everyone') into v_audience
    from public.birthday_config bc where bc.org_id = p_org;
  v_audience := coalesce(v_audience, 'everyone');

  return query
  select m.user_id,
         coalesce(
           sp.full_name,
           nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',
                                u.raw_user_meta_data->>'name','')),'')),
         coalesce(sp.birthday::text,
                  nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'')),
         m.role = 'student'
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.student_profiles sp on sp.user_id = m.user_id and sp.org_id = m.org_id
  where m.org_id = p_org
    and coalesce(sp.birthday::text,
                 nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'')) is not null
    and case v_audience
          when 'leaders'  then m.role <> 'student'
          when 'students' then m.role = 'student'
          else true
        end;
end; $$;
revoke all on function public.org_birthdays_all(uuid) from public;
revoke all on function public.org_birthdays_all(uuid) from authenticated;
grant execute on function public.org_birthdays_all(uuid) to service_role;
