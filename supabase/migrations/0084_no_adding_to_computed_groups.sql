-- ===========================================================================
-- Switch Leader App — 0084 don't let anyone be added to a computed group
--
-- "All Leaders" / "All Students" (is_all) and the role groups (auto_role) are
-- CHANNELS WORKED OUT FROM THE ROSTER, not groups you put people in. Being in
-- All Leaders means "you are on the leader roster somewhere" — it isn't a
-- membership anybody assigns.
--
-- The 👥 panel in a channel adds to whatever channel you have open, which
-- included those. Doing it created a roster row nothing would ever show you:
-- the roster board deliberately skips computed groups, so the person became
-- invisible there while sitting in the chat. That is exactly the shape of
-- failure that cost us a morning's debugging, so it is refused at the source
-- rather than merely surfaced afterwards.
--
-- The board now also lists anyone already in one of these under "Elsewhere on
-- the roster", so existing rows can be found and cleared.
-- ===========================================================================

create or replace function public.add_to_chat_group(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_grade text; v_phone text; v_g public.roster_groups;
begin
  if not public.can_manage_chat_group(p_group) then
    raise exception 'you can only change groups you lead';
  end if;

  select * into v_g from public.roster_groups where id = p_group;
  if v_g.id is null then raise exception 'no such group'; end if;
  v_org := v_g.org_id;

  if v_g.is_all then
    raise exception 'Everyone on the roster is already in %. Add them to one of their actual groups instead.', v_g.name;
  end if;
  if v_g.auto_role is not null then
    raise exception '% is worked out from people''s roles, so nobody is added to it directly. Set their role to "%" on the roster instead.', v_g.name, v_g.auto_role;
  end if;

  if not exists (select 1 from public.memberships where org_id = v_org and user_id = p_user) then
    raise exception 'that person isn''t in this app';
  end if;
  if exists (select 1 from public.roster_people
              where group_id = p_group and user_id = p_user) then
    return;  -- already there; nothing to do and nothing to complain about
  end if;

  select s.full_name, public.grade_from_grad_year(s.grad_year), s.phone
    into v_name, v_grade, v_phone
    from public.student_profiles s where s.user_id = p_user;

  if v_name is null then
    select coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',
                                         u.raw_user_meta_data->>'name', '')), ''), u.email::text)
      into v_name from auth.users u where u.id = p_user;
  end if;

  insert into public.roster_people (org_id, group_id, name, user_id, grade, phone)
  values (v_org, p_group, coalesce(v_name, 'Someone'), p_user, v_grade, v_phone);
end;
$$;
revoke all on function public.add_to_chat_group(uuid, uuid) from public;
grant execute on function public.add_to_chat_group(uuid, uuid) to authenticated;
