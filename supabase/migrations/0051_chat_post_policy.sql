-- ===========================================================================
-- Team Hub Platform — 0051 per-channel posting policy (who may send messages)
--
-- Lets an owner/admin control who can POST in a channel (used for the All
-- Leaders channel, but stored per group so it's reusable):
--   • 'all'              → anyone who can see the channel (default; unchanged)
--   • 'managers'         → owners/admins/editors only
--   • 'managers_coaches' → owners/admins/editors + anyone with the Coach role
-- Reading is unchanged — this only restricts who can send. Enforced in RLS so
-- it can't be bypassed from the client.
-- ===========================================================================

alter table public.roster_groups
  add column if not exists post_policy text not null default 'all'
  check (post_policy in ('all', 'managers', 'managers_coaches'));

-- Can the current user POST in this channel? Must be allowed to see it AND
-- satisfy the channel's post policy. (Managers can always post.)
create or replace function public.can_post_chat_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roster_groups g
    where g.id = p_group
      and public.can_access_chat_group(p_group)
      and (
        public.has_org_role(g.org_id, array['owner','admin','editor'])
        or coalesce(g.post_policy, 'all') = 'all'
        or (coalesce(g.post_policy, 'all') = 'managers_coaches'
            and exists (select 1 from public.roster_people rp
                        where rp.org_id = g.org_id and rp.role = 'Coach' and rp.user_id = auth.uid()))
      )
  );
$$;
revoke all on function public.can_post_chat_group(uuid) from public;
grant execute on function public.can_post_chat_group(uuid) to authenticated;

-- Posting a message now checks the post policy (reading still uses access).
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert
  with check (user_id = auth.uid() and public.can_post_chat_group(group_id));

-- Owner/admin sets a channel's post policy.
create or replace function public.set_chat_post_policy(p_group uuid, p_policy text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.roster_groups where id = p_group;
  if v_org is null then raise exception 'channel not found'; end if;
  if not public.has_org_role(v_org, array['owner','admin']) then
    raise exception 'only an owner or admin can change who may post';
  end if;
  if p_policy not in ('all','managers','managers_coaches') then
    raise exception 'invalid policy';
  end if;
  update public.roster_groups set post_policy = p_policy where id = p_group;
end;
$$;
revoke all on function public.set_chat_post_policy(uuid, text) from public;
grant execute on function public.set_chat_post_policy(uuid, text) to authenticated;

-- Expose is_all, post_policy, and whether the caller can post, so the app can
-- show the setting (All Leaders only) and hide the composer for read-only users.
drop function if exists public.my_chat_groups(uuid);
create or replace function public.my_chat_groups(p_org uuid)
returns table (group_id uuid, name text, parent_id uuid, parent_name text, sort int, unread int, is_all boolean, post_policy text, can_post boolean)
language plpgsql security definer set search_path = public as $$
declare v_mgr boolean;
begin
  if auth.uid() is null then return; end if;
  v_mgr := public.has_org_role(p_org, array['owner','admin','editor']);
  return query
  select g.id, g.name, g.parent_id, pg.name, g.sort,
    case
      when exists (select 1 from public.chat_mutes cm where cm.group_id = g.id and cm.user_id = auth.uid()) then 0
      when (
        v_mgr
        or (g.is_all and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
      ) then (
        select count(*)::int from public.chat_messages m
         where m.group_id = g.id and m.user_id <> auth.uid()
           and m.created_at > coalesce(
             (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
             'epoch'::timestamptz))
      else 0 end,
    coalesce(g.is_all, false),
    coalesce(g.post_policy, 'all'),
    public.can_post_chat_group(g.id)
  from public.roster_groups g
  left join public.roster_groups pg on pg.id = g.parent_id
  where g.org_id = p_org
    and (
      v_mgr
      or (g.is_all and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.user_id = auth.uid()))
      or (not g.is_all and g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
      or (not g.is_all and g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
    )
  order by g.parent_id nulls first, g.sort, g.name;
end;
$$;
revoke all on function public.my_chat_groups(uuid) from public;
grant execute on function public.my_chat_groups(uuid) to authenticated;
