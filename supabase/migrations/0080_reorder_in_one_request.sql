-- ===========================================================================
-- Switch Leader App — 0080 reorder a roster in one request
--
-- Moving one person used to be one UPDATE per person, sent one after another
-- and each waiting on the last. A group of twenty was twenty round trips
-- before anything moved on screen — which on a phone is a couple of seconds
-- per tap of an arrow, and is why reordering a roster felt broken.
--
-- One statement instead. The array's own ordering supplies the new sort, so
-- the whole list is rewritten in a single pass.
-- ===========================================================================

create or replace function public.reorder_roster_people(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.roster_people rp
     set sort = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where rp.id = x.id
     -- Same permission as editing the roster any other way: a manager, or the
     -- leader of the student group this row is in. A row the caller may not
     -- touch simply doesn't move, rather than the whole reorder failing.
     and (
       public.has_org_role(rp.org_id, array['owner','admin','editor'])
       or public.can_manage_chat_group(rp.group_id)
     );
$$;
revoke all on function public.reorder_roster_people(uuid[]) from public;
grant execute on function public.reorder_roster_people(uuid[]) to authenticated;

create or replace function public.reorder_roster_groups(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.roster_groups g
     set sort = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where g.id = x.id
     and public.has_org_role(g.org_id, array['owner','admin','editor']);
$$;
revoke all on function public.reorder_roster_groups(uuid[]) from public;
grant execute on function public.reorder_roster_groups(uuid[]) to authenticated;
