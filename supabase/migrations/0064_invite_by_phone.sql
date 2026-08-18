-- ===========================================================================
-- Team Hub Platform — 0064 tie an invite to a phone number
--
-- An invite could already be locked to an email address. But everyone signs up
-- with their phone number too (it's required, and stored on the account), and
-- for a youth-ministry team a phone number is often the thing a leader actually
-- has on hand — they text the link, they don't email it. So an invite can now
-- carry a phone number instead of, or as well as, an email.
--
-- Matching is on digits, not on what was typed: "(555) 555-1234", "555-555-1234"
-- and "+1 555 555 1234" are the same person, and an invite that rejected someone
-- over a hyphen would be worse than no lock at all. normalize_phone() reduces
-- both sides to the last ten digits before comparing, which also makes a
-- US number with a leading 1 match one without.
--
-- Whatever is set is enforced; whatever is blank is ignored. An invite with
-- neither stays open to anyone holding the link, exactly as before.
-- ===========================================================================

alter table public.invites add column if not exists phone text;

-- --- digits-only comparison key for a phone number -------------------------
-- Null for anything with no digits at all. Longer numbers keep their last ten
-- so a country code doesn't cause a false mismatch; shorter ones are left
-- as-is rather than guessed at.
create or replace function public.normalize_phone(p_phone text)
returns text language sql immutable set search_path = public as $$
  select case
           when d = '' then null
           when length(d) > 10 then right(d, 10)
           else d
         end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) t;
$$;
grant execute on function public.normalize_phone(text) to anon, authenticated;

-- --- create an invite, optionally addressed to an email and/or phone -------
-- Replacing rather than overloading: a second signature would leave PostgREST
-- unable to choose between them (PGRST203), which is exactly what 0015 had to
-- clean up after 0013 added the email argument this same way.
drop function if exists public.create_invite(uuid, text, timestamptz, text);
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
  if p_role not in ('owner','admin','editor','viewer') then
    raise exception 'invalid role';
  end if;
  -- Reject a phone number we could never match, rather than minting a link
  -- that silently turns away the very person it was made for. Checked here
  -- because the admin is present to fix it; the joiner would not be.
  if nullif(trim(coalesce(p_phone, '')), '') is not null
     and coalesce(length(public.normalize_phone(p_phone)), 0) < 10 then
    raise exception 'Enter a full 10-digit phone number, e.g. (555) 555-5555.';
  end if;

  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into public.invites (org_id, code, role, expires_at, email, phone)
  values (
    p_org, v_code, p_role, p_expires,
    nullif(trim(coalesce(p_email, '')), ''),
    -- Stored as typed so the admin's list and the join page read naturally;
    -- only the comparison is normalized.
    nullif(trim(coalesce(p_phone, '')), '')
  );
  return v_code;
end;
$$;
revoke all on function public.create_invite(uuid, text, timestamptz, text, text) from public;
grant execute on function public.create_invite(uuid, text, timestamptz, text, text) to authenticated;

-- --- redeem, enforcing whichever of email/phone the invite carries ---------
create or replace function public.redeem_invite(p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites;
  v_slug   text;
  v_email  text;
  v_phone  text;
begin
  if auth.uid() is null then
    raise exception 'sign in to redeem an invite';
  end if;

  select * into v_invite
  from public.invites
  where code = lower(p_code)
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_invite.id is null then
    raise exception 'invalid or expired invite code';
  end if;

  if v_invite.email is not null then
    select email into v_email from auth.users where id = auth.uid();
    if lower(coalesce(v_email, '')) <> lower(v_invite.email) then
      raise exception 'This invitation is for %. Sign in (or create your account) with that email to accept it.', v_invite.email;
    end if;
  end if;

  if v_invite.phone is not null then
    select nullif(trim(coalesce(raw_user_meta_data->>'phone', '')), '')
      into v_phone
      from auth.users where id = auth.uid();
    if v_phone is null then
      -- Accounts created before the phone field was required have nothing to
      -- match, so say that rather than implying they typed it wrong.
      raise exception 'This invitation is for the phone number %, but your account does not have a phone number saved. Ask whoever invited you to send a new link.', v_invite.phone;
    end if;
    if public.normalize_phone(v_phone) is distinct from public.normalize_phone(v_invite.phone) then
      raise exception 'This invitation is for %. Sign in (or create your account) with that phone number to accept it.', v_invite.phone;
    end if;
  end if;

  insert into public.memberships (user_id, org_id, role)
  values (auth.uid(), v_invite.org_id, v_invite.role)
  on conflict (user_id, org_id) do update set role = excluded.role;

  select slug into v_slug from public.organizations where id = v_invite.org_id;
  return v_slug;
end;
$$;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

-- --- public preview: also report the phone, so the join page can prefill ---
-- Dropped first: adding a column to the returned table changes the function's
-- return type, which CREATE OR REPLACE refuses (42P13).
drop function if exists public.invite_info(text);
create or replace function public.invite_info(p_code text)
returns table (
  org_slug text, org_name text, app_name text,
  icon_url text, logo_url text,
  primary_color text, primary_text text, heading_color text,
  role text, email text, phone text, valid boolean
)
language sql security definer set search_path = public as $$
  select
    o.slug,
    o.name,
    coalesce(nullif(s.app_name, ''), o.name),
    s.icon_url,
    s.logo_url,
    coalesce(s.theme->>'primary', '#0f1420'),
    coalesce(s.theme->>'primaryText', '#ffffff'),
    coalesce(s.theme->>'heading', '#1c2541'),
    i.role,
    i.email,
    i.phone,
    (i.expires_at is null or i.expires_at > now()) as valid
  from public.invites i
  join public.organizations o on o.id = i.org_id
  left join public.app_settings s on s.org_id = o.id
  where i.code = lower(p_code)
  limit 1;
$$;
revoke all on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;
