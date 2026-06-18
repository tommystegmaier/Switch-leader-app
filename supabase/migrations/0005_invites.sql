-- ===========================================================================
-- Team Hub Platform — 0005 invite create + redeem RPCs
--
-- Powers invite_only workspaces: an owner/admin generates an invite code, and
-- an invited (signed-in) user redeems it to gain a membership (default role
-- 'viewer'). Both are SECURITY DEFINER so redemption doesn't require the
-- invitee to have any prior access to the workspace's rows.
-- ===========================================================================

-- Create an invite code (owner/admin only). Returns the code.
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

  v_code := lower(encode(gen_random_bytes(6), 'hex'));
  insert into public.invites (org_id, code, role, expires_at)
  values (p_org, v_code, p_role, p_expires);
  return v_code;
end;
$$;

-- Redeem an invite code for the current user. Returns the workspace slug.
create or replace function public.redeem_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_slug text;
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

  insert into public.memberships (user_id, org_id, role)
  values (auth.uid(), v_invite.org_id, v_invite.role)
  on conflict (user_id, org_id) do nothing;

  select slug into v_slug from public.organizations where id = v_invite.org_id;
  return v_slug;
end;
$$;

revoke all on function public.create_invite(uuid, text, timestamptz) from public;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.create_invite(uuid, text, timestamptz) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
