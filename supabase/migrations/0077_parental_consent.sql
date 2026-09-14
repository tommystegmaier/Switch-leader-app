-- ===========================================================================
-- Switch Leader App — 0077 parental consent for students under 13
--
-- Switch takes 6th graders, so some students signing up are 11 or 12. A child
-- that age should not be posting messages and photos into a group chat without
-- a parent having agreed to it. Switch has no permission forms on file today,
-- so the app has to collect that agreement itself.
--
-- HOW IT WORKS
--   A student under 13 gives a parent/guardian name and a way to reach them.
--   The app makes a one-off link. The parent opens it — usually on the spot,
--   on the student's phone — reads what is collected and who can see it, types
--   their name, and agrees. That is recorded with the time.
--
--   Until then the student is signed up and can read student pages, but CANNOT
--   BE PUT IN A GROUP CHAT. That gate is enforced by a trigger below, not by
--   hiding a button: chat is where a child's own words and photos would go, so
--   it is the thing that actually has to be locked.
--
-- WHY NOT STORE A STATUS
--   Whether consent is needed is worked out from the birthday every time it is
--   asked, not saved as a flag. A twelve-year-old becomes a thirteen-year-old
--   without anybody doing anything, and a stored status would still say
--   "blocked" months later. The requirement lapses on its own birthday.
-- ===========================================================================

-- --- 1. What we hold about the parent -------------------------------------
alter table public.student_profiles
  add column if not exists parent_name        text,
  add column if not exists parent_email       text,
  add column if not exists parent_phone       text,
  -- Who agreed, when, and how. Kept as evidence: "a parent agreed" is worth
  -- nothing without being able to say which parent and on what date.
  add column if not exists consent_granted_at timestamptz,
  add column if not exists consent_by_name    text,
  add column if not exists consent_relation   text,
  add column if not exists consent_method     text,
  -- The one-off link. Random, and cleared the moment it is used, so a link
  -- forwarded or left in a text thread can't be replayed later.
  add column if not exists consent_token      text;

create unique index if not exists student_profiles_consent_token_idx
  on public.student_profiles(consent_token) where consent_token is not null;

-- --- 2. Age, and whether consent is outstanding ---------------------------
create or replace function public.is_under_13(p_birthday date)
returns boolean language sql stable set search_path = public as $$
  -- No birthday on file is treated as under 13. The safe way round: an unknown
  -- age should cost a leader a phone call, not let a child straight into a chat.
  select p_birthday is null or p_birthday > (current_date - interval '13 years');
$$;
grant execute on function public.is_under_13(date) to anon, authenticated;

create or replace function public.student_needs_consent(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_profiles s
     where s.user_id = p_user
       and s.consent_granted_at is null
       and public.is_under_13(s.birthday)
  );
$$;
revoke all on function public.student_needs_consent(uuid) from public;
grant execute on function public.student_needs_consent(uuid) to authenticated;

-- --- 3. The gate ----------------------------------------------------------
-- A trigger rather than a check in the app. Putting someone in a group is done
-- from several places, and a rule that has to be remembered in each of them is
-- a rule that will be missed in one of them.
create or replace function public.block_unconsented_student()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.user_id is not null and public.student_needs_consent(new.user_id) then
    select full_name into v_name from public.student_profiles where user_id = new.user_id;
    raise exception
      '% is under 13 and their parent or guardian hasn''t given permission yet. Send them the permission link from Settings → Students, then add % to the group.',
      coalesce(v_name, 'This student'), coalesce(split_part(v_name, ' ', 1), 'them');
  end if;
  return new;
end;
$$;

drop trigger if exists roster_people_consent_gate on public.roster_people;
create trigger roster_people_consent_gate
  before insert or update of user_id, group_id on public.roster_people
  for each row execute function public.block_unconsented_student();

-- --- 4. Making a link for a parent ----------------------------------------
create or replace function public.student_consent_link(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_token text;
begin
  select org_id, consent_token into v_org, v_token
    from public.student_profiles where user_id = p_user;
  if v_org is null then raise exception 'no such student'; end if;
  if not public.has_org_role(v_org, array['owner','admin','editor','viewer']) then
    raise exception 'only a leader can send a permission link';
  end if;

  -- Reuse the outstanding link rather than minting a new one each time it is
  -- looked at, so a link already texted to a parent keeps working.
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');
    update public.student_profiles set consent_token = v_token where user_id = p_user;
  end if;
  return v_token;
end;
$$;
revoke all on function public.student_consent_link(uuid) from public;
grant execute on function public.student_consent_link(uuid) to authenticated;

-- --- 5. What the parent sees ----------------------------------------------
-- Readable WITHOUT signing in, because a parent has no account here and should
-- not have to make one to answer a question about their own child. It returns
-- the child's name and the ministry's, and nothing else — a guessed token
-- must not become a way to read a phone number or a birthday.
create or replace function public.consent_request_info(p_token text)
returns table (student_name text, org_name text, already_granted boolean)
language sql stable security definer set search_path = public as $$
  select s.full_name, o.name, s.consent_granted_at is not null
    from public.student_profiles s
    join public.organizations o on o.id = s.org_id
   where s.consent_token = p_token
     and p_token is not null and length(p_token) >= 32;
$$;
revoke all on function public.consent_request_info(text) from public;
grant execute on function public.consent_request_info(text) to anon, authenticated;

-- --- 6. The parent agreeing -----------------------------------------------
create or replace function public.grant_student_consent(
  p_token text, p_parent_name text, p_relation text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text := trim(coalesce(p_parent_name, ''));
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'that permission link isn''t valid';
  end if;
  if length(v_name) < 2 then raise exception 'please enter your full name'; end if;

  select user_id into v_user from public.student_profiles
   where consent_token = p_token and consent_granted_at is null;
  if v_user is null then
    raise exception 'that permission link has already been used, or isn''t valid any more';
  end if;

  update public.student_profiles
     set consent_granted_at = now(),
         consent_by_name    = v_name,
         consent_relation   = nullif(trim(coalesce(p_relation, '')), ''),
         consent_method     = 'parent_link',
         -- Spent. A link left in a text thread can't be reused.
         consent_token      = null
   where user_id = v_user;
end;
$$;
revoke all on function public.grant_student_consent(text, text, text) from public;
grant execute on function public.grant_student_consent(text, text, text) to anon, authenticated;

-- --- 7. A leader recording permission they already have -------------------
-- For the parent who says yes in person, or hands over a signed form. The
-- leader's name is recorded as the person attesting to it, because someone
-- should be answerable for that claim.
create or replace function public.attest_student_consent(p_user uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_who text;
begin
  select org_id into v_org from public.student_profiles where user_id = p_user;
  if v_org is null then raise exception 'no such student'; end if;
  if not public.has_org_role(v_org, array['owner','admin']) then
    raise exception 'only a Youth Pastor or Coach can record permission';
  end if;

  select coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',
                                       u.raw_user_meta_data->>'name', '')), ''), u.email)
    into v_who from auth.users u where u.id = auth.uid();

  update public.student_profiles
     set consent_granted_at = now(),
         consent_by_name    = coalesce(nullif(trim(coalesce(p_note, '')), ''),
                                       'Recorded by ' || coalesce(v_who, 'a leader')),
         consent_relation   = 'recorded by leader',
         consent_method     = 'leader_attested',
         consent_token      = null
   where user_id = p_user;
end;
$$;
revoke all on function public.attest_student_consent(uuid, text) from public;
grant execute on function public.attest_student_consent(uuid, text) to authenticated;

-- --- 8. A parent withdrawing, and seeing what is held ----------------------
-- Withdrawing takes the student straight back out of every group chat. Consent
-- that can't be taken back isn't consent.
create or replace function public.revoke_student_consent(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.student_profiles where user_id = p_user;
  if v_org is null then raise exception 'no such student'; end if;
  if not public.has_org_role(v_org, array['owner','admin']) then
    raise exception 'only a Youth Pastor or Coach can withdraw permission';
  end if;

  delete from public.roster_people where user_id = p_user and org_id = v_org;
  update public.student_profiles
     set consent_granted_at = null, consent_by_name = null,
         consent_relation = null, consent_method = null, consent_token = null
   where user_id = p_user;
end;
$$;
revoke all on function public.revoke_student_consent(uuid) from public;
grant execute on function public.revoke_student_consent(uuid) to authenticated;

-- --- 9. The student list, now showing where consent stands ----------------
drop function if exists public.list_students(uuid);
create or replace function public.list_students(p_org uuid)
returns table (
  user_id uuid, full_name text, grad_year int, grade text,
  birthday date, phone text, created_at timestamptz,
  under_13 boolean, needs_consent boolean,
  consent_granted_at timestamptz, consent_by_name text, consent_method text,
  parent_name text, parent_phone text, parent_email text
)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.full_name, s.grad_year,
         public.grade_from_grad_year(s.grad_year),
         s.birthday, s.phone, s.created_at,
         public.is_under_13(s.birthday),
         public.is_under_13(s.birthday) and s.consent_granted_at is null,
         s.consent_granted_at, s.consent_by_name, s.consent_method,
         s.parent_name, s.parent_phone, s.parent_email
    from public.student_profiles s
   where s.org_id = p_org
     and public.has_org_role(p_org, array['owner','admin','editor','viewer'])
   order by
     -- The ones needing a parent chased float to the top.
     (public.is_under_13(s.birthday) and s.consent_granted_at is null) desc,
     s.grad_year nulls last, lower(s.full_name);
$$;
revoke all on function public.list_students(uuid) from public;
grant execute on function public.list_students(uuid) to authenticated;
