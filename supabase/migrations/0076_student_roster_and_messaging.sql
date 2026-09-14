-- ===========================================================================
-- Switch Leader App — 0076 the student roster, and student messaging
--
-- A roster group now belongs to one side of the app or the other. Leader
-- groups are what exists today; student groups are new, and the chat channels
-- that hang off them are Student Messaging.
--
-- Doing it this way rather than building a second chat system means student
-- messaging arrives with unread counts, push notifications, mutes, reporting,
-- blocking, editing and deletion already working and already tested.
--
-- Leaders can be put in student groups, which is the point — a group's leaders
-- are in the conversation and can moderate it.
--
-- THE IMPORTANT PART: the rule for "is this person in this channel" was
-- copy-pasted into five functions. Making it student-aware five times, by
-- hand, is how a student ends up reading a leaders' channel because one copy
-- was missed. It is now written once, in chat_member_of(), and the five
-- callers all defer to it.
-- ===========================================================================

-- --- 1. Which side of the app a group belongs to --------------------------
alter table public.roster_groups
  add column if not exists kind text not null default 'leader';

alter table public.roster_groups drop constraint if exists roster_groups_kind_check;
alter table public.roster_groups add constraint roster_groups_kind_check
  check (kind in ('leader','student'));

create index if not exists roster_groups_org_kind_idx on public.roster_groups(org_id, kind);
-- The membership lookups below hit these two shapes constantly.
create index if not exists roster_people_group_user_idx on public.roster_people(group_id, user_id);
create index if not exists roster_people_org_user_idx  on public.roster_people(org_id, user_id);

-- --- 2. Is this person assigned to this group? -----------------------------
-- SECURITY DEFINER on purpose: it is called from RLS policies ON roster_people,
-- and a policy that queried its own table through RLS would recurse forever.
create or replace function public.in_roster_group(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roster_people rp
     where rp.group_id = p_group and rp.user_id = p_user
  );
$$;
revoke all on function public.in_roster_group(uuid, uuid) from public;
grant execute on function public.in_roster_group(uuid, uuid) to authenticated;

-- --- 3. The one definition of channel membership ---------------------------
--
-- Leader channels:  unchanged, except that a student is never in one.
--
-- Student channels: a Youth Pastor or Coach is in every one of them. That is
--   deliberate and is a safeguarding decision, not a convenience: conversations
--   with minors in a ministry should be visible to the people accountable for
--   that ministry. Everyone else — including a Leader, and including a Leader
--   with edit access — sees only the student groups they have been put in.
create or replace function public.chat_member_of(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.roster_groups g
      join public.memberships m on m.org_id = g.org_id and m.user_id = p_user
     where g.id = p_group
       and case when coalesce(g.kind, 'leader') = 'student' then
             m.role in ('owner','admin')
             or (g.is_all and exists (
                   select 1 from public.roster_people rp
                     join public.roster_groups rg on rg.id = rp.group_id
                    where rg.org_id = g.org_id and coalesce(rg.kind,'leader') = 'student'
                      and rp.user_id = p_user))
             or (not g.is_all and exists (
                   select 1 from public.roster_people rp
                    where rp.group_id = g.id and rp.user_id = p_user))
           else
             -- A student is never in a leader channel, whatever else is true.
             m.role <> 'student' and (
               m.role in ('owner','admin','editor')
               or (g.is_all and exists (
                     select 1 from public.roster_people rp
                       join public.roster_groups rg on rg.id = rp.group_id
                      where rg.org_id = g.org_id and coalesce(rg.kind,'leader') = 'leader'
                        and rp.user_id = p_user))
               or (not g.is_all and g.auto_role is not null and exists (
                     select 1 from public.roster_people rp
                       join public.roster_groups rg on rg.id = rp.group_id
                      where rg.org_id = g.org_id and coalesce(rg.kind,'leader') = 'leader'
                        and rp.role = g.auto_role and rp.user_id = p_user))
               or (not g.is_all and g.auto_role is null and exists (
                     select 1 from public.roster_people rp
                      where rp.group_id = g.id and rp.user_id = p_user))
             )
           end
  );
$$;
revoke all on function public.chat_member_of(uuid, uuid) from public;
grant execute on function public.chat_member_of(uuid, uuid) to authenticated;

-- --- 4. The five callers now all defer to it -------------------------------
create or replace function public.can_access_chat_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.chat_member_of(p_group, auth.uid());
$$;
revoke all on function public.can_access_chat_group(uuid) from public;
grant execute on function public.can_access_chat_group(uuid) to authenticated;

-- Channel list, now for one side of the app at a time. Keeping p_kind as a
-- defaulted argument means a client that hasn't updated yet still gets the
-- leader channels it asked for rather than an error.
drop function if exists public.my_chat_groups(uuid);
drop function if exists public.my_chat_groups(uuid, text);
create or replace function public.my_chat_groups(p_org uuid, p_kind text default 'leader')
returns table (
  group_id uuid, name text, parent_id uuid, parent_name text, sort int,
  unread int, is_all boolean, post_policy text, can_post boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.parent_id, pg.name, g.sort,
    case when exists (select 1 from public.chat_mutes cm
                       where cm.group_id = g.id and cm.user_id = auth.uid())
      then 0
      else (select count(*)::int from public.chat_messages m
             where m.group_id = g.id and m.user_id <> auth.uid()
               and m.created_at > coalesce(
                 (select r.last_read_at from public.chat_reads r
                   where r.group_id = g.id and r.user_id = auth.uid()),
                 'epoch'::timestamptz))
    end,
    coalesce(g.is_all, false),
    coalesce(g.post_policy, 'all'),
    public.can_post_chat_group(g.id)
  from public.roster_groups g
  left join public.roster_groups pg on pg.id = g.parent_id
  where g.org_id = p_org
    and coalesce(g.kind, 'leader') = coalesce(p_kind, 'leader')
    and auth.uid() is not null
    and public.chat_member_of(g.id, auth.uid())
  order by g.parent_id nulls first, g.sort, g.name;
$$;
revoke all on function public.my_chat_groups(uuid, text) from public;
grant execute on function public.my_chat_groups(uuid, text) to authenticated;

-- The badge counts every channel someone is in, on both sides. A student's
-- badge is their student channels; a leader in a student group sees that
-- group's unread in the same number as the rest.
create or replace function public.chat_unread_total_for(p_org uuid, p_user uuid)
returns int language sql security definer set search_path = public as $$
  select coalesce(sum(
    (select count(*) from public.chat_messages m
      where m.group_id = g.id and m.user_id <> p_user
        and m.created_at > coalesce(
          (select r.last_read_at from public.chat_reads r
            where r.group_id = g.id and r.user_id = p_user),
          'epoch'::timestamptz))
  ), 0)::int
  from public.roster_groups g
  where g.org_id = p_org
    and public.chat_member_of(g.id, p_user)
    and not exists (select 1 from public.chat_mutes cm
                     where cm.group_id = g.id and cm.user_id = p_user);
$$;

create or replace function public.my_chat_unread_total(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 0
              else public.chat_unread_total_for(p_org, auth.uid()) end;
$$;
revoke all on function public.my_chat_unread_total(uuid) from public;
grant execute on function public.my_chat_unread_total(uuid) to authenticated;

create or replace function public.chat_unread_totals_for(p_org uuid, p_users uuid[])
returns table (user_id uuid, total int)
language sql security definer set search_path = public as $$
  select u.uid, public.chat_unread_total_for(p_org, u.uid)
    from unnest(p_users) as u(uid);
$$;
revoke all on function public.chat_unread_totals_for(uuid, uuid[]) from public;
grant execute on function public.chat_unread_totals_for(uuid, uuid[]) to service_role;

-- --- 4b. Who gets pushed a message in this channel -------------------------
-- /api/notify-chat worked this out for itself, which made it a sixth copy of
-- the rule — and a copy that predates student groups. Left alone it would have
-- pushed a student's message in "All Students" to every leader on the roster,
-- and pushed a preview of a student conversation to a Leader with edit access
-- who isn't in the group and can't open it.
--
-- The muted are already removed here, so the Function doesn't have to remember
-- to do that either.
create or replace function public.chat_group_recipients(p_group uuid)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select m.user_id
    from public.roster_groups g
    join public.memberships m on m.org_id = g.org_id
   where g.id = p_group
     and public.chat_member_of(p_group, m.user_id)
     and not exists (select 1 from public.chat_mutes cm
                      where cm.group_id = p_group and cm.user_id = m.user_id);
$$;
revoke all on function public.chat_group_recipients(uuid) from public;
grant execute on function public.chat_group_recipients(uuid) to service_role;

-- --- 5. Moderating a student channel ---------------------------------------
-- A Leader put into a student group can delete messages in it. That is the
-- whole reason for putting a leader in the group: somebody has to be able to
-- take down what shouldn't be there, and waiting for a Coach to log in is not
-- a moderation policy.
--
-- A student can still only delete their own message. Nothing here widens that.
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages for delete
  using (
    user_id = auth.uid()
    or public.has_org_role(org_id, array['owner','admin','editor'])
    or (
      public.my_org_role(org_id) = 'viewer'
      and exists (select 1 from public.roster_groups g
                   where g.id = group_id and coalesce(g.kind,'leader') = 'student')
      and public.in_roster_group(group_id, auth.uid())
    )
  );

-- --- 6. Who can read the roster --------------------------------------------
-- Until now any member could read the whole roster. With students in the app
-- that would hand a student every leader's name, email and phone number, and
-- every other student's too.
drop policy if exists roster_groups_select on public.roster_groups;
create policy roster_groups_select on public.roster_groups for select
  using (
    case when coalesce(kind, 'leader') = 'student' then
      -- Never public: a list of minors is not something an open workspace
      -- should serve to anyone who asks.
      public.is_org_member(org_id)
      and (public.my_org_role(org_id) is distinct from 'student'
           or public.chat_member_of(id, auth.uid()))
    else
      (public.is_org_member(org_id) or public.org_is_public(org_id))
      and public.my_org_role(org_id) is distinct from 'student'
    end
  );

drop policy if exists roster_people_select on public.roster_people;
create policy roster_people_select on public.roster_people for select
  using (
    case when public.my_org_role(org_id) = 'student' then
      -- A student sees the people in their own groups and nobody else.
      public.chat_member_of(group_id, auth.uid())
    else
      public.is_org_member(org_id) or public.org_is_public(org_id)
    end
  );

-- Writing the roster stays owner/admin/editor, which already excludes
-- students — a student cannot add themselves to a group.
