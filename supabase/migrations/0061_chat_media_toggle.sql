-- ===========================================================================
-- Team Hub Platform — 0061 platform switch for chat media (photos + voice)
--
-- Storage and CDN egress are the real cost of letting anyone create an app, and
-- they're driven almost entirely by chat photos and voice messages. This lets
-- the PLATFORM owner turn media off per app from the command center, leaving
-- text chat (and GIFs, which are hotlinked from GIPHY and cost us nothing)
-- fully working.
--
-- Deliberately on `organizations` and settable only via a platform-admin RPC —
-- NOT in app_settings, which an app's own owner can edit. Enforced in RLS so
-- turning it off actually prevents uploads rather than only hiding buttons.
-- ===========================================================================

alter table public.organizations
  add column if not exists chat_media_enabled boolean not null default true;

-- Platform admins flip it; nobody else can.
create or replace function public.platform_set_chat_media(p_org uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  update public.organizations set chat_media_enabled = coalesce(p_enabled, true) where id = p_org;
end;
$$;
revoke all on function public.platform_set_chat_media(uuid, boolean) from public;
grant execute on function public.platform_set_chat_media(uuid, boolean) to authenticated;

-- Is media allowed in this workspace? (Default true for older rows.)
create or replace function public.chat_media_allowed(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select o.chat_media_enabled from public.organizations o where o.id = p_org), true);
$$;
revoke all on function public.chat_media_allowed(uuid) from public;
grant execute on function public.chat_media_allowed(uuid) to authenticated;

-- Enforce it: with media off, a message may not carry an upload. Text, GIFs
-- (external URLs) and polls are unaffected.
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert
  with check (
    user_id = auth.uid()
    and public.can_post_chat_group(group_id)
    and (
      public.chat_media_allowed(org_id)
      or (coalesce(audio_url, '') = '' and coalesce(video_url, '') = ''
          and (coalesce(image_url, '') = '' or image_url ilike '%giphy.com%'))
    )
  );

-- Show the current setting per app in the command center.
create or replace function public.platform_list_apps()
returns table (
  org_id uuid, name text, slug text, app_name text, created_at timestamptz,
  member_count int, owners jsonb, chat_media_enabled boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return query
  select
    o.id, o.name, o.slug,
    coalesce(nullif(s.app_name, ''), o.name),
    o.created_at,
    (select count(*)::int from public.memberships m where m.org_id = o.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'banned', (u.banned_until is not null and u.banned_until > now())
      ) order by u.email)
      from public.memberships mo
      join auth.users u on u.id = mo.user_id
      where mo.org_id = o.id and mo.role = 'owner'
    ), '[]'::jsonb),
    coalesce(o.chat_media_enabled, true)
  from public.organizations o
  left join public.app_settings s on s.org_id = o.id
  order by o.created_at desc;
end;
$$;
revoke all on function public.platform_list_apps() from public;
grant execute on function public.platform_list_apps() to authenticated;
