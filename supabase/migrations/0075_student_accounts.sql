-- ===========================================================================
-- Switch Leader App — 0075 student accounts
--
-- A student signs up from a link the Youth Pastor sends, with no email
-- address: name, graduation year, birthday, phone number, password. They are
-- in immediately, and see student pages — but no group chat at all until a
-- leader puts them in a group (that part lands in 0076, with the roster).
--
-- Accounts are created by the /api/student-signup Function using the service
-- role, not by the app. Supabase needs an email address to hang an account on,
-- so one is derived from the phone number and never shown to anyone. That
-- address cannot receive mail, which is the whole reason a Coach can reset a
-- student's password from inside the app: there is nowhere to send a reset
-- link, so a person has to be able to do it.
--
-- Graduation year rather than grade, deliberately. A grade is wrong every
-- August and someone has to remember to fix 200 of them; a graduation year is
-- right forever and the grade is worked out from it.
-- ===========================================================================

-- --- 1. Student invite links ----------------------------------------------
-- create_invite refuses any role it doesn't recognise, so 'student' has to be
-- added before a student link can exist. Owners and admins only, same as every
-- other invite.
create or replace function public.create_invite(
  p_org uuid,
  p_role text default 'viewer',
  p_expires timestamptz default null,
  p_email text default null,
  p_phone text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can create invites';
  end if;
  if p_role not in ('owner','admin','editor','viewer','student') then
    raise exception 'invalid role';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is not null
     and coalesce(length(public.normalize_phone(p_phone)), 0) < 10 then
    raise exception 'Enter a full 10-digit phone number, e.g. (555) 555-5555.';
  end if;

  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into public.invites (org_id, code, role, expires_at, email, phone)
  values (
    p_org, v_code, p_role, p_expires,
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), '')
  );
  return v_code;
end;
$$;
revoke all on function public.create_invite(uuid, text, timestamptz, text, text) from public;
grant execute on function public.create_invite(uuid, text, timestamptz, text, text) to authenticated;

-- --- 2. The student record -------------------------------------------------
create table if not exists public.student_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  full_name   text not null,
  grad_year   int,
  birthday    date,
  phone       text,
  -- Digits-only copy, so "(555) 555-5555" and "5555555555" are one number.
  -- This is what the sign-in page turns a typed phone number into, and what
  -- stops the same student signing up twice with different punctuation.
  phone_key   text,
  created_at  timestamptz not null default now()
);

create index if not exists student_profiles_org_idx on public.student_profiles(org_id);
create unique index if not exists student_profiles_phone_key_idx
  on public.student_profiles(org_id, phone_key) where phone_key is not null;

alter table public.student_profiles enable row level security;

-- A student sees their own record and nobody else's — not the other students'
-- phone numbers or birthdays. Leaders of the same app see all of them.
drop policy if exists student_profiles_select on public.student_profiles;
create policy student_profiles_select on public.student_profiles
  for select using (
    user_id = auth.uid()
    or public.has_org_role(org_id, array['owner','admin','editor','viewer'])
  );

-- Writes go through the service role (sign-up) or the RPCs below. No policy
-- here means no student can edit their own graduation year to follow their
-- friends into a different group.
grant select on public.student_profiles to authenticated;

-- --- 3. Graduation year -> the grade they're in right now ------------------
-- The school year rolls over in August, so anything from August onwards counts
-- as the next year's grade. Returns null once they've graduated.
create or replace function public.grade_from_grad_year(p_grad_year int)
returns text language sql stable set search_path = public as $$
  select case
    when p_grad_year is null then null
    else (
      select case g
        when 12 then '12th Grade' when 11 then '11th Grade'
        when 10 then '10th Grade' when 9  then '9th Grade'
        when 8  then '8th Grade'  when 7  then '7th Grade'
        when 6  then '6th Grade'
        else null end
      from (
        select 12 - (p_grad_year - (
          extract(year from now())::int
          + case when extract(month from now())::int >= 8 then 1 else 0 end
        )) as g
      ) t
    )
  end;
$$;
grant execute on function public.grade_from_grad_year(int) to anon, authenticated;

-- --- 4. The student list a leader sees -------------------------------------
create or replace function public.list_students(p_org uuid)
returns table (
  user_id uuid, full_name text, grad_year int, grade text,
  birthday date, phone text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.full_name, s.grad_year,
         public.grade_from_grad_year(s.grad_year),
         s.birthday, s.phone, s.created_at
    from public.student_profiles s
   where s.org_id = p_org
     and public.has_org_role(p_org, array['owner','admin','editor','viewer'])
   order by s.grad_year nulls last, lower(s.full_name);
$$;
revoke all on function public.list_students(uuid) from public;
grant execute on function public.list_students(uuid) to authenticated;

-- --- 5. A leader fixes a student's details ---------------------------------
create or replace function public.update_student(
  p_user uuid, p_name text default null, p_grad_year int default null,
  p_birthday date default null, p_phone text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.student_profiles where user_id = p_user;
  if v_org is null then raise exception 'no such student'; end if;
  if not public.has_org_role(v_org, array['owner','admin']) then
    raise exception 'only a Youth Pastor or Coach can edit a student';
  end if;

  update public.student_profiles
     set full_name = coalesce(nullif(trim(coalesce(p_name, '')), ''), full_name),
         grad_year = coalesce(p_grad_year, grad_year),
         birthday  = coalesce(p_birthday, birthday),
         phone     = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
         phone_key = case
           when nullif(trim(coalesce(p_phone, '')), '') is not null
             then public.normalize_phone(p_phone)
           else phone_key end
   where user_id = p_user;
end;
$$;
revoke all on function public.update_student(uuid, text, int, date, text) from public;
grant execute on function public.update_student(uuid, text, int, date, text) to authenticated;

-- --- 6. Close the published-snapshot hole ----------------------------------
-- 0074 added published_pages_for_me / published_blocks_for_me but left the
-- table readable, because every phone was still on a build that read it
-- directly and cutting that off mid-session would have emptied the app.
-- Those builds have since updated themselves, and students exist from here on,
-- so the direct read goes away: the snapshot is one row holding every page, so
-- anyone who can read the row can read a leader-only page out of it.
revoke select on public.published_content from anon, authenticated;

drop policy if exists published_content_select on public.published_content;
create policy published_content_select on public.published_content
  for select using (
    public.has_org_role(org_id, array['owner','admin','editor'])
  );
grant select on public.published_content to authenticated;
