-- ===========================================================================
-- Switch Leader App — 0082 remove the parental permission workflow
--
-- 0077 added an in-app permission flow for students under 13: a link a parent
-- opened and agreed on, and a gate stopping an under-13 being put into any
-- group chat until they had. It is being removed at the ministry's direction —
-- parental permission is handled outside the app.
--
-- WHAT GOES
--   the gate on roster_people, the consent link, the parent-facing page's
--   data, and the leader-side recording and withdrawal.
--
-- WHAT STAYS, and why
--   The consent_* COLUMNS are left on student_profiles rather than dropped.
--   Any permission a parent actually gave through the old flow is a record
--   that belongs to that family, and deleting it would be the one step here
--   that can't be undone. They are simply no longer read.
--
--   parent_name / parent_phone / parent_email stay and are still collected for
--   under-13s, now as plain contact details so a leader can reach a parent.
--   That is not permission and never was the part being removed.
-- ===========================================================================

-- --- 1. the gate ----------------------------------------------------------
drop trigger if exists roster_people_consent_gate on public.roster_people;
drop function if exists public.block_unconsented_student();

-- --- 2. the flow ----------------------------------------------------------
drop function if exists public.student_consent_link(uuid);
drop function if exists public.consent_request_info(text);
drop function if exists public.grant_student_consent(text, text, text);
drop function if exists public.attest_student_consent(uuid, text);
drop function if exists public.revoke_student_consent(uuid);

-- --- 3. callers that asked whether permission was outstanding -------------
-- chat_group_candidates greyed out a student who was waiting on a parent.
-- Nobody waits now, so the column goes and every student can be added.
--
-- Dropped first, not replaced: this returns one column fewer than the 0079
-- version, and Postgres refuses to change a function's return type in place
-- (42P13). Same reason list_students is dropped below.
drop function if exists public.chat_group_candidates(uuid);
create or replace function public.chat_group_candidates(p_group uuid)
returns table (user_id uuid, name text, grade text, is_student boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(
           s.full_name,
           nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',
                                u.raw_user_meta_data->>'name', '')), ''),
           u.email::text),
         public.grade_from_grad_year(s.grad_year),
         m.role = 'student'
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

-- The student list drops its permission columns. under_13 goes too: without a
-- gate behind it, it was only ever shown to explain the gate.
drop function if exists public.list_students(uuid);
create or replace function public.list_students(p_org uuid)
returns table (
  user_id uuid, full_name text, grad_year int, grade text,
  birthday date, phone text, created_at timestamptz,
  parent_name text, parent_phone text, parent_email text
)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.full_name, s.grad_year,
         public.grade_from_grad_year(s.grad_year),
         s.birthday, s.phone, s.created_at,
         s.parent_name, s.parent_phone, s.parent_email
    from public.student_profiles s
   where s.org_id = p_org
     and public.has_org_role(p_org, array['owner','admin','editor','viewer'])
   order by s.grad_year nulls last, lower(s.full_name);
$$;
revoke all on function public.list_students(uuid) from public;
grant execute on function public.list_students(uuid) to authenticated;

-- student_needs_consent is dropped last: the two functions above were the only
-- things calling it.
drop function if exists public.student_needs_consent(uuid);

-- is_under_13 is left in place. It reads a birthday and returns a boolean,
-- costs nothing, and is the kind of thing that gets wanted again.
