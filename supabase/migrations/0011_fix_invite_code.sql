-- ===========================================================================
-- Team Hub Platform — 0011 fix invite code generation
--
-- create_invite (0005) built its code with gen_random_bytes(), which lives in
-- the pgcrypto extension. On Supabase pgcrypto is installed in the "extensions"
-- schema, but the function pins search_path = public, so gen_random_bytes is
-- not resolvable and every create_invite call errored. gen_random_uuid() is a
-- Postgres core function (no extension, always on the path), so we build the
-- code from that instead. Same guards and behaviour otherwise.
-- ===========================================================================

create or replace function public.create_invite(
  p_org uuid,
  p_role text default 'viewer',
  p_expires timestamptz default null
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

  -- 16-char hex code from a core uuid (no pgcrypto dependency).
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into public.invites (org_id, code, role, expires_at)
  values (p_org, v_code, p_role, p_expires);
  return v_code;
end;
$$;
