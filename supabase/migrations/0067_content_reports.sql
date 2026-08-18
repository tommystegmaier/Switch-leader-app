-- ===========================================================================
-- Team Hub Platform — 0067 report a chat message
--
-- Both app stores require that people can flag content they find offensive,
-- and that a human can act on it. This is the flagging half.
--
-- The report SNAPSHOTS the message (author, text, media link) instead of only
-- pointing at it. Two reasons: the offending message is usually deleted soon
-- after — often by the person who posted it — and a report that then reads
-- "message unavailable" is useless to whoever has to decide what happened. The
-- snapshot is also what makes the record hold up if someone denies it later.
--
-- Reports are readable only through the platform functions below, never
-- directly: a reporter shouldn't be able to see other people's reports, and the
-- person reported shouldn't be able to see they were.
-- ===========================================================================

create table if not exists public.content_reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  group_id      uuid,
  -- Kept nullable and set null on delete: removing the message is usually the
  -- OUTCOME of a report, and it must not erase the report itself.
  message_id    uuid references public.chat_messages(id) on delete set null,
  reporter_id   uuid references auth.users(id) on delete set null,
  reporter_name text,
  author_id     uuid references auth.users(id) on delete set null,
  author_name   text,
  body_excerpt  text,
  media_url     text,
  reason        text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id) on delete set null
);
create index if not exists content_reports_open_idx on public.content_reports(created_at desc) where resolved_at is null;

alter table public.content_reports enable row level security;
-- Intentionally no policies: every read and write goes through the SECURITY
-- DEFINER functions below, which enforce who may do what.

-- --- file a report ---------------------------------------------------------
create or replace function public.report_chat_message(p_message uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_msg public.chat_messages; v_me text;
begin
  if auth.uid() is null then raise exception 'sign in to report a message'; end if;

  select * into v_msg from public.chat_messages where id = p_message;
  if v_msg.id is null then raise exception 'that message is no longer there'; end if;

  -- Only someone who can actually see the channel can report from it, so this
  -- can't be used to probe messages in channels you have no access to.
  if not public.can_access_chat_group(v_msg.group_id) then
    raise exception 'not authorized';
  end if;

  select nullif(trim(coalesce(raw_user_meta_data->>'full_name', '')), '')
    into v_me from auth.users where id = auth.uid();

  insert into public.content_reports (
    org_id, group_id, message_id, reporter_id, reporter_name,
    author_id, author_name, body_excerpt, media_url, reason
  ) values (
    v_msg.org_id, v_msg.group_id, v_msg.id, auth.uid(), v_me,
    v_msg.user_id, v_msg.author_name, left(coalesce(v_msg.body, ''), 500),
    coalesce(v_msg.image_url, v_msg.audio_url), nullif(trim(coalesce(p_reason, '')), '')
  );
end;
$$;
revoke all on function public.report_chat_message(uuid, text) from public;
grant execute on function public.report_chat_message(uuid, text) to authenticated;

-- --- review reports (platform admins) --------------------------------------
create or replace function public.platform_list_reports(p_include_resolved boolean default false)
returns table (
  id uuid, org_id uuid, app_name text, group_id uuid,
  message_id uuid, still_posted boolean,
  reporter_name text, author_name text, body_excerpt text, media_url text,
  reason text, created_at timestamptz, resolved_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return query
  select
    r.id, r.org_id,
    coalesce(nullif(s.app_name, ''), o.name)::text,
    r.group_id,
    r.message_id,
    (r.message_id is not null),
    r.reporter_name::text, r.author_name::text, r.body_excerpt::text, r.media_url::text,
    r.reason::text, r.created_at, r.resolved_at
  from public.content_reports r
  join public.organizations o on o.id = r.org_id
  left join public.app_settings s on s.org_id = r.org_id
  where p_include_resolved or r.resolved_at is null
  order by r.created_at desc
  limit 200;
end;
$$;
revoke all on function public.platform_list_reports(boolean) from public;
grant execute on function public.platform_list_reports(boolean) to authenticated;

-- --- act on a report -------------------------------------------------------
-- p_delete_message removes the offending message in the same step, so the
-- common case (look, agree, remove) isn't two trips through two screens.
create or replace function public.platform_resolve_report(p_report uuid, p_delete_message boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_msg uuid;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;

  select message_id into v_msg from public.content_reports where id = p_report;
  if p_delete_message and v_msg is not null then
    delete from public.chat_messages where id = v_msg;
  end if;

  update public.content_reports
     set resolved_at = now(), resolved_by = auth.uid()
   where id = p_report;
end;
$$;
revoke all on function public.platform_resolve_report(uuid, boolean) from public;
grant execute on function public.platform_resolve_report(uuid, boolean) to authenticated;

-- --- how many are waiting (drives the badge in the command center) ---------
create or replace function public.platform_open_report_count()
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then return 0; end if;
  return (select count(*)::int from public.content_reports where resolved_at is null);
end;
$$;
revoke all on function public.platform_open_report_count() from public;
grant execute on function public.platform_open_report_count() to authenticated;
