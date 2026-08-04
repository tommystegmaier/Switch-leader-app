-- ===========================================================================
-- Team Hub Platform — 0031 Group chat
--
-- A channel == a Roster group. Owners/admins/editors can see & post in every
-- channel; a viewer can see & post only in the roster groups they're assigned
-- to (roster_people.user_id). Messages support photo attachments and emoji
-- reactions. chat_reads tracks each person's last-read time per channel for
-- unread counts / the bottom-bar badge.
-- ===========================================================================

-- Can the current user see/post in this roster group's chat?
create or replace function public.can_access_chat_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roster_groups g
    where g.id = p_group
      and (
        public.has_org_role(g.org_id, array['owner','admin','editor'])
        or exists (
          select 1 from public.roster_people rp
          where rp.group_id = g.id and rp.user_id = auth.uid()
        )
      )
  );
$$;
revoke all on function public.can_access_chat_group(uuid) from public;
grant execute on function public.can_access_chat_group(uuid) to authenticated;

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  group_id    uuid not null references public.roster_groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text,
  body        text,
  image_url   text,
  created_at  timestamptz not null default now(),
  check (coalesce(body, '') <> '' or coalesce(image_url, '') <> '')
);
create index if not exists chat_messages_group_idx on public.chat_messages(group_id, created_at);

create table if not exists public.chat_reactions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  group_id   uuid not null references public.roster_groups(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists chat_reactions_group_idx on public.chat_reactions(group_id);

create table if not exists public.chat_reads (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  group_id     uuid not null references public.roster_groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.chat_messages  enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_reads     enable row level security;

grant select, insert, delete on public.chat_messages  to authenticated;
grant select, insert, delete on public.chat_reactions to authenticated;
grant select, insert, update on public.chat_reads     to authenticated;

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages for select using (public.can_access_chat_group(group_id));
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert
  with check (user_id = auth.uid() and public.can_access_chat_group(group_id));
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages for delete
  using (user_id = auth.uid() or public.has_org_role(org_id, array['owner','admin','editor']));

drop policy if exists chat_reactions_select on public.chat_reactions;
create policy chat_reactions_select on public.chat_reactions for select using (public.can_access_chat_group(group_id));
drop policy if exists chat_reactions_insert on public.chat_reactions;
create policy chat_reactions_insert on public.chat_reactions for insert
  with check (user_id = auth.uid() and public.can_access_chat_group(group_id));
drop policy if exists chat_reactions_delete on public.chat_reactions;
create policy chat_reactions_delete on public.chat_reactions for delete using (user_id = auth.uid());

drop policy if exists chat_reads_select on public.chat_reads;
create policy chat_reads_select on public.chat_reads for select using (user_id = auth.uid());
drop policy if exists chat_reads_write on public.chat_reads;
create policy chat_reads_write on public.chat_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_chat_group(group_id));

-- The channels the current user can see, each with their unread count.
create or replace function public.my_chat_groups(p_org uuid)
returns table (group_id uuid, name text, parent_id uuid, sort int, unread int)
language plpgsql security definer set search_path = public as $$
declare v_mgr boolean;
begin
  if auth.uid() is null then return; end if;
  v_mgr := public.has_org_role(p_org, array['owner','admin','editor']);
  return query
  select g.id, g.name, g.parent_id, g.sort,
    (select count(*)::int from public.chat_messages m
       where m.group_id = g.id and m.user_id <> auth.uid()
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
           'epoch'::timestamptz))
  from public.roster_groups g
  where g.org_id = p_org
    and (v_mgr or exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
  order by g.parent_id nulls first, g.sort, g.name;
end;
$$;
revoke all on function public.my_chat_groups(uuid) from public;
grant execute on function public.my_chat_groups(uuid) to authenticated;

-- Total unread across all channels the current user can see (bottom-bar badge).
create or replace function public.my_chat_unread_total(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_mgr boolean; v_total int;
begin
  if auth.uid() is null then return 0; end if;
  v_mgr := public.has_org_role(p_org, array['owner','admin','editor']);
  select coalesce(sum(x.unread), 0)::int into v_total from (
    select (select count(*) from public.chat_messages m
       where m.group_id = g.id and m.user_id <> auth.uid()
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
           'epoch'::timestamptz)) as unread
    from public.roster_groups g
    where g.org_id = p_org
      and (v_mgr or exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
  ) x;
  return v_total;
end;
$$;
revoke all on function public.my_chat_unread_total(uuid) from public;
grant execute on function public.my_chat_unread_total(uuid) to authenticated;
