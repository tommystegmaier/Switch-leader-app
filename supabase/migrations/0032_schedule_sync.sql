-- ===========================================================================
-- Team Hub Platform — 0032 Sync the schedule from the Roster
--
-- A manager button that fills the serving schedule from the Roster:
--   * each roster group  -> a schedule team (matched by name; created if new)
--   * each person's title -> a role within that team ('Member' if no title)
--   * each account-linked person -> added to that role's recurring roster
-- Additive and safe: it never deletes teams, roles, or people a manager set up
-- by hand — it only adds who's currently on the roster. Free-text roster people
-- (no app account) are skipped, since the schedule needs a real account.
-- ===========================================================================

create or replace function public.sync_schedule_from_roster(p_org uuid)
returns table (teams_created int, people_added int)
language plpgsql security definer set search_path = public as $$
declare
  g record;
  rp record;
  v_team uuid;
  v_role uuid;
  v_rolename text;
  v_teams int := 0;
  v_added int := 0;
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can sync the schedule';
  end if;

  for g in select id, name from public.roster_groups where org_id = p_org loop
    select id into v_team from public.schedule_teams where org_id = p_org and name = g.name limit 1;
    if v_team is null then
      insert into public.schedule_teams (org_id, name) values (p_org, g.name) returning id into v_team;
      v_teams := v_teams + 1;
    end if;

    for rp in select user_id, role from public.roster_people where group_id = g.id and user_id is not null loop
      v_rolename := coalesce(nullif(trim(rp.role), ''), 'Member');
      select id into v_role from public.schedule_roles where org_id = p_org and team_id = v_team and name = v_rolename limit 1;
      if v_role is null then
        insert into public.schedule_roles (org_id, team_id, name) values (p_org, v_team, v_rolename) returning id into v_role;
      end if;
      insert into public.schedule_roster (org_id, role_id, user_id)
        values (p_org, v_role, rp.user_id)
        on conflict (role_id, user_id) do nothing;
      if found then v_added := v_added + 1; end if;
    end loop;
  end loop;

  return query select v_teams, v_added;
end;
$$;

revoke all on function public.sync_schedule_from_roster(uuid) from public;
grant execute on function public.sync_schedule_from_roster(uuid) to authenticated;
