-- ===========================================================================
-- Switch Leader App — 0079 group leaders run their own group, and what a
-- student may send
--
-- TWO THINGS
--
-- 1. A leader put into a student group can now add and remove people in THAT
--    group. They could already delete messages there (0076); not being able to
--    add the student sitting in front of them meant every change still went
--    through the Youth Pastor, which is the bottleneck this app exists to
--    remove. Scoped hard: it is their group only, it does not extend to leader
--    groups, and a student never gets it.
--
-- 2. A student can send text and GIFs. Not photos, not video, not voice.
--
--    GIFs are hotlinked from GIPHY and never stored, so they carry none of the
--    risk of a child uploading a picture of themselves into a group chat. This
--    reuses the shape already in the insert policy for workspaces with media
--    switched off, so there is one rule about attachments, not two.
--
--    Leaders in the same student channel can still send photos and voice —
--    the limit is on who is posting, not which channel it is.
-- ===========================================================================

-- --- 1. Who can run a group -----------------------------------------------
create or replace function public.can_manage_chat_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.roster_groups g
      join public.memberships m on m.org_id = g.org_id and m.user_id = auth.uid()
     where g.id = p_group
       and (
         m.role in ('owner','admin','editor')
         or (
           -- A group's own leader, in a student group only. Deliberately NOT
           -- extended to leader groups: who is on the leader roster is a
           -- staffing decision, not something a channel member changes.
           coalesce(g.kind, 'leader') = 'student'
           and m.role <> 'student'
           and public.in_roster_group(p_group, auth.uid())
         )
       )
  );
$$;
revoke all on function public.can_manage_chat_group(uuid) from public;
grant execute on function public.can_manage_chat_group(uuid) to authenticated;

-- --- 2. Who is in this group ----------------------------------------------
create or replace function public.chat_group_members(p_group uuid)
returns table (person_id uuid, user_id uuid, name text, role text, is_student boolean)
language sql stable security definer set search_path = public as $$
  select rp.id, rp.user_id, rp.name, rp.role,
         coalesce(m.role = 'student', false)
    from public.roster_people rp
    left join public.memberships m
           on m.user_id = rp.user_id and m.org_id = rp.org_id
   where rp.group_id = p_group
     and public.can_manage_chat_group(p_group)
   order by coalesce(m.role = 'student', false), lower(rp.name);
$$;
revoke all on function public.chat_group_members(uuid) from public;
grant execute on function public.chat_group_members(uuid) to authenticated;

-- --- 3. Who could be added ------------------------------------------------
-- Names and grades only. A group leader has no need of every student's phone
-- number just to find the right person in a list.
create or replace function public.chat_group_candidates(p_group uuid)
returns table (user_id uuid, name text, grade text, is_student boolean, needs_consent boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(
           s.full_name,
           nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',
                                u.raw_user_meta_data->>'name', '')), ''),
           u.email::text),
         public.grade_from_grad_year(s.grad_year),
         m.role = 'student',
         coalesce(public.student_needs_consent(m.user_id), false)
    from public.roster_groups g
    join public.memberships m on m.org_id = g.org_id
    join auth.users u on u.id = m.user_id
    left join public.student_profiles s on s.user_id = m.user_id
   where g.id = p_group
     and public.can_manage_chat_group(p_group)
     and not exists (
       select 1 from public.roster_people rp
        where rp.group_id = p_group and rp.user_id = m.user_id
     )
   order by (m.role = 'student') desc, 2;
$$;
revoke all on function public.chat_group_candidates(uuid) from public;
grant execute on function public.chat_group_candidates(uuid) to authenticated;

-- --- 4. Adding and removing ------------------------------------------------
-- Through functions rather than by widening the roster write policy. The rule
-- is "this group, if you lead it", and a policy broad enough to express that
-- on roster_people would also let a group leader edit rows in groups they have
-- nothing to do with.
create or replace function public.add_to_chat_group(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_grade text; v_phone text;
begin
  if not public.can_manage_chat_group(p_group) then
    raise exception 'you can only change groups you lead';
  end if;
  select org_id into v_org from public.roster_groups where id = p_group;

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

  -- The parental-permission trigger on roster_people fires here and will stop
  -- an under-13 without consent, with its own message.
  insert into public.roster_people (org_id, group_id, name, user_id, grade, phone)
  values (v_org, p_group, coalesce(v_name, 'Someone'), p_user, v_grade, v_phone);
end;
$$;
revoke all on function public.add_to_chat_group(uuid, uuid) from public;
grant execute on function public.add_to_chat_group(uuid, uuid) to authenticated;

create or replace function public.remove_from_chat_group(p_group uuid, p_person uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_chat_group(p_group) then
    raise exception 'you can only change groups you lead';
  end if;
  -- Scoped to the group being managed, so a person id from somewhere else
  -- can't be passed in to delete a row in a group the caller doesn't lead.
  delete from public.roster_people where id = p_person and group_id = p_group;
end;
$$;
revoke all on function public.remove_from_chat_group(uuid, uuid) from public;
grant execute on function public.remove_from_chat_group(uuid, uuid) to authenticated;

-- --- 5. What a student may attach -----------------------------------------
-- Text and GIFs. A GIF is a GIPHY link, stored nowhere and uploaded by nobody;
-- a photo or a voice message is a file a child has made of themselves, and is
-- a different thing to put in a group chat.
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert
  with check (
    user_id = auth.uid()
    and public.can_post_chat_group(group_id)
    and (
      (
        public.chat_media_allowed(org_id)
        and coalesce(public.my_org_role(org_id), '') <> 'student'
      )
      or (coalesce(audio_url, '') = '' and coalesce(video_url, '') = ''
          and (coalesce(image_url, '') = '' or image_url ilike '%giphy.com%'))
    )
  );
