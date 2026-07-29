-- ===========================================================================
-- Team Hub Platform — 0027 Roster: link to accounts + self-service photos
--
-- 1. A roster entry can optionally link to an app account (user_id). Managers
--    add people either as free-text entries (as before) or by picking an
--    existing member.
-- 2. A signed-in member can set/replace/remove THEIR OWN photo wherever they
--    appear in the roster (set_my_roster_photo), without being able to edit
--    anyone else. Managers keep full edit via normal RLS.
-- 3. Allow any org member (not just editors) to UPLOAD to their org's media
--    folder, so a regular volunteer can add their own photo. Update/delete of
--    media stays editor-only.
-- ===========================================================================

alter table public.roster_people
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists roster_people_user_idx on public.roster_people(user_id);

-- A member updates only their own photo (all their entries in this org).
create or replace function public.set_my_roster_photo(p_org uuid, p_photo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in to update your photo'; end if;
  update public.roster_people
    set photo_url = nullif(p_photo, '')
    where org_id = p_org and user_id = auth.uid();
end; $$;

revoke all on function public.set_my_roster_photo(uuid, text) from public;
grant execute on function public.set_my_roster_photo(uuid, text) to authenticated;

-- Members a manager can pick when adding to the roster — includes the phone
-- number they entered at sign-up, so it auto-fills into their roster info.
create or replace function public.roster_account_options(p_org uuid)
returns table (user_id uuid, name text, email text, phone text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view members';
  end if;
  return query
  select m.user_id,
         nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name','')),''),
         u.email::text,
         nullif(trim(coalesce(u.raw_user_meta_data->>'phone','')),'')
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
  order by 2 nulls last, 3;
end; $$;

revoke all on function public.roster_account_options(uuid) from public;
grant execute on function public.roster_account_options(uuid) to authenticated;

-- Let any org member upload into their org's media folder (self-photos).
-- The editor-only media_write policy still governs update/delete; this only
-- adds INSERT for members (RLS policies are OR-ed).
drop policy if exists media_member_insert on storage.objects;
create policy media_member_insert on storage.objects
  for insert with check (
    bucket_id = 'media'
    and public.is_org_member( public.uuid_or_null((storage.foldername(name))[1]) )
  );
