-- ===========================================================================
-- Team Hub Platform — 0069 add an existing account to an app by email
--
-- Invites assume the person starts from the link and finishes in one sitting.
-- Real life doesn't always cooperate: someone signs up through a general
-- share-anyone link, or gets interrupted by email confirmation, and ends up
-- with a perfectly good account that belongs to no app. Until now the only
-- remedy was another invite, which is the one thing that doesn't help — they
-- already have an account, so the sign-up form just says so.
--
-- This is the direct route: the platform operator names an existing account and
-- puts it where it needs to be. It is not a way to create accounts — the person
-- must already have signed up, because we're only ever attaching an identity
-- that exists, never inventing one.
-- ===========================================================================

create or replace function public.platform_add_member(
  p_org uuid, p_email text, p_role text default 'viewer'
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid;
  v_email  text;
  v_exists boolean;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if p_role not in ('owner','admin','editor','viewer') then
    raise exception 'invalid role';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'that app no longer exists';
  end if;

  select u.id, u.email::text into v_uid, v_email
    from auth.users u
   where lower(u.email) = lower(trim(coalesce(p_email, '')))
   limit 1;

  if v_uid is null then
    -- Deliberately specific. "Not found" would leave the operator guessing
    -- between a typo and a person who never finished signing up, and those
    -- need opposite responses.
    raise exception 'No account uses %. They need to create one first — then add them here.', trim(coalesce(p_email, ''));
  end if;

  select exists (select 1 from public.memberships m where m.user_id = v_uid and m.org_id = p_org)
    into v_exists;

  -- Upsert rather than insert: adding someone who's already in the app is a
  -- reasonable way to fix their role, and should not be an error.
  insert into public.memberships (user_id, org_id, role)
  values (v_uid, p_org, p_role)
  on conflict (user_id, org_id) do update set role = excluded.role;

  return case when v_exists then 'updated:' else 'added:' end || v_email;
end;
$$;
revoke all on function public.platform_add_member(uuid, text, text) from public;
grant execute on function public.platform_add_member(uuid, text, text) to authenticated;
