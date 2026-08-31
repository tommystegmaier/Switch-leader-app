-- ===========================================================================
-- Team Hub Platform — 0072 unread totals for many people in one call
--
-- Badging a broadcast needs everyone's unread count, and doing that one person
-- at a time meant one network round trip per recipient. At 104 devices that is
-- 104 round trips from a Cloudflare Function before a single notification has
-- been sent — and Workers cap the number of outbound requests a single
-- invocation may make, so the sends themselves were being starved by the
-- lookups meant to decorate them.
--
-- Same arithmetic as chat_unread_total_for, asked once for a whole list.
-- ===========================================================================

create or replace function public.chat_unread_totals_for(p_org uuid, p_users uuid[])
returns table (user_id uuid, total int)
language sql security definer set search_path = public as $$
  select u.uid,
         coalesce((
           select sum(
             (select count(*) from public.chat_messages m
               where m.group_id = g.id and m.user_id <> u.uid
                 and m.created_at > coalesce(
                   (select r.last_read_at from public.chat_reads r
                     where r.group_id = g.id and r.user_id = u.uid),
                   'epoch'::timestamptz))
           )::int
           from public.roster_groups g
           where g.org_id = p_org
             and (
               -- Managers see every channel; everyone else sees the ones they're
               -- actually in. Mirrors can_access_chat_group.
               exists (select 1 from public.memberships mm
                        where mm.org_id = p_org and mm.user_id = u.uid
                          and mm.role in ('owner','admin','editor'))
               or (g.is_all and exists (select 1 from public.roster_people rp
                                         where rp.org_id = p_org and rp.user_id = u.uid))
               or (not g.is_all and g.auto_role is null and exists (
                     select 1 from public.roster_people rp
                      where rp.group_id = g.id and rp.user_id = u.uid))
               or (not g.is_all and g.auto_role is not null and exists (
                     select 1 from public.roster_people rp
                      where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = u.uid))
             )
             and not exists (select 1 from public.chat_mutes cm
                              where cm.group_id = g.id and cm.user_id = u.uid)
         ), 0)::int
    from unnest(p_users) as u(uid);
$$;
revoke all on function public.chat_unread_totals_for(uuid, uuid[]) from public;
-- Server-side only: it reports other people's unread counts, which no signed-in
-- user has any business asking for.
grant execute on function public.chat_unread_totals_for(uuid, uuid[]) to service_role;
