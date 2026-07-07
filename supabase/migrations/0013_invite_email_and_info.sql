-- ===========================================================================
-- Team Hub Platform — 0013 invite recipient email + public invite preview
--
-- Two things so invite links "just work":
--  1. An optional intended-recipient email on each invite, so an admin can tie
--     a link to a specific person (shown in the list, pre-filled on the accept
--     page). Not hard-enforced — it's a convenience, not a lock.
--  2. invite_info(code): a SECURITY DEFINER preview any (even anonymous) visitor
--     can call to see what a code is for — workspace name + role + intended
--     email — so the accept page can say "You're invited to X as an Editor."
--     Exposes no sensitive data; the code itself is the secret.
-- ===========================================================================

alter table public.invites add column if not exists email text;

-- Remove the previous 3-arg version so adding the 4-arg one below doesn't leave
-- two overloads (which PostgREST can't disambiguate — PGRST203).
drop function if exists public.create_invite(uuid, text, timestamptz);

-- Extend create_invite to store the optional recipient email.
create or replace function public.create_invite(
  p_org uuid,
  p_role text default 'viewer',
  p_expires timestamptz default null,
  p_email text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can create invites';
  end if;
  if p_role not in ('owner','admin','editor','viewer') then
    raise exception 'invalid role';
  end if;

  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into public.invites (org_id, code, role, expires_at, email)
  values (p_org, v_code, p_role, p_expires, nullif(trim(p_email), ''));
  return v_code;
end;
$$;

revoke all on function public.create_invite(uuid, text, timestamptz, text) from public;
grant execute on function public.create_invite(uuid, text, timestamptz, text) to authenticated;

-- Public preview of an invite by its code (safe: the code is the secret).
create or replace function public.invite_info(p_code text)
returns table (org_slug text, org_name text, role text, email text, valid boolean)
language sql
security definer
set search_path = public
as $$
  select
    o.slug,
    o.name,
    i.role,
    i.email,
    (i.expires_at is null or i.expires_at > now()) as valid
  from public.invites i
  join public.organizations o on o.id = i.org_id
  where i.code = lower(p_code)
  limit 1;
$$;

revoke all on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;
