-- ===========================================================================
-- Team Hub Platform — 0014 lock invites to their intended email
--
-- When an invite carries an intended email (set by the admin), only an account
-- with that exact email may redeem it. This guarantees a specific-permission
-- link (e.g. an Owner invite) can only be used by the person it was meant for,
-- even if the link leaks. Invites with no email stay open (anyone with the code
-- can accept), preserving the simple share-a-link case.
-- ===========================================================================

create or replace function public.redeem_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_slug text;
  v_email text;
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

  -- If the invite is addressed to a specific email, enforce it.
  if v_invite.email is not null then
    select email into v_email from auth.users where id = auth.uid();
    if lower(coalesce(v_email, '')) <> lower(v_invite.email) then
      raise exception 'This invitation is for %. Sign in (or create your account) with that email to accept it.', v_invite.email;
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
