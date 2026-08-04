-- ===========================================================================
-- Team Hub Platform — 0033 Chat channels carry their parent group name
--
-- So the chat can land on the subgroup you're in and show the larger (parent)
-- group in the header, my_chat_groups now also returns parent_name. Adding a
-- column changes the return type, so drop-then-recreate.
-- ===========================================================================

drop function if exists public.my_chat_groups(uuid);

create or replace function public.my_chat_groups(p_org uuid)
returns table (group_id uuid, name text, parent_id uuid, parent_name text, sort int, unread int)
language plpgsql security definer set search_path = public as $$
declare v_mgr boolean;
begin
  if auth.uid() is null then return; end if;
  v_mgr := public.has_org_role(p_org, array['owner','admin','editor']);
  return query
  select g.id, g.name, g.parent_id, pg.name, g.sort,
    (select count(*)::int from public.chat_messages m
       where m.group_id = g.id and m.user_id <> auth.uid()
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
           'epoch'::timestamptz))
  from public.roster_groups g
  left join public.roster_groups pg on pg.id = g.parent_id
  where g.org_id = p_org
    and (v_mgr or exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
  order by g.parent_id nulls first, g.sort, g.name;
end;
$$;

revoke all on function public.my_chat_groups(uuid) from public;
grant execute on function public.my_chat_groups(uuid) to authenticated;
