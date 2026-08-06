-- ===========================================================================
-- Team Hub Platform — 0050 branded invite preview
--
-- Extend invite_info(code) to also return the workspace's branding (app name,
-- logo/icon, and key theme colors) so the accept-invite page can look like the
-- app the person is joining — not a generic form. Still safe for anonymous
-- callers (the code is the secret; this exposes only public branding).
-- ===========================================================================

drop function if exists public.invite_info(text);
create or replace function public.invite_info(p_code text)
returns table (
  org_slug text, org_name text, app_name text,
  icon_url text, logo_url text,
  primary_color text, primary_text text, heading_color text,
  role text, email text, valid boolean
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
    (i.expires_at is null or i.expires_at > now()) as valid
  from public.invites i
  join public.organizations o on o.id = i.org_id
  left join public.app_settings s on s.org_id = o.id
  where i.code = lower(p_code)
  limit 1;
$$;
revoke all on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;
