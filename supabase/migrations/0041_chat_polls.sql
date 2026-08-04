-- ===========================================================================
-- Team Hub Platform — 0041 Chat polls
--
-- Anyone in a chat channel can post a poll (a question + options) and everyone
-- in that channel can tap to vote and see live results. One vote per person;
-- tapping your current choice again removes your vote, tapping another changes
-- it. A poll is just a chat message with a `poll` payload (the question lives
-- in `body`); votes live in their own table, gated to the channel like every
-- other chat row.
-- ===========================================================================

-- The poll payload on a message: { "options": ["A","B",...] }. Null = normal msg.
alter table public.chat_messages add column if not exists poll jsonb;

create table if not exists public.chat_poll_votes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  group_id     uuid not null references public.roster_groups(id) on delete cascade,
  message_id   uuid not null references public.chat_messages(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  option_index int  not null,
  created_at   timestamptz not null default now(),
  unique (message_id, user_id)               -- one vote per person per poll
);
create index if not exists chat_poll_votes_group_idx   on public.chat_poll_votes(group_id);
create index if not exists chat_poll_votes_message_idx on public.chat_poll_votes(message_id);

alter table public.chat_poll_votes enable row level security;
grant select on public.chat_poll_votes to authenticated;

-- Read votes for any channel you can access (drives the live tallies).
drop policy if exists chat_poll_votes_select on public.chat_poll_votes;
create policy chat_poll_votes_select on public.chat_poll_votes for select
  using (public.can_access_chat_group(group_id));

-- Cast / change / retract a vote. Tapping the same option again removes it;
-- tapping a different option switches it. Access is re-checked here.
create or replace function public.vote_chat_poll(p_message uuid, p_option int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
  v_org   uuid;
  v_count int;
  v_current int;
begin
  if auth.uid() is null then raise exception 'sign in to vote'; end if;

  select group_id, org_id, coalesce(jsonb_array_length(poll->'options'), 0)
    into v_group, v_org, v_count
  from public.chat_messages where id = p_message;

  if v_group is null then raise exception 'poll not found'; end if;
  if v_count = 0 then raise exception 'that message is not a poll'; end if;
  if p_option < 0 or p_option >= v_count then raise exception 'invalid option'; end if;
  if not public.can_access_chat_group(v_group) then raise exception 'no access to this chat'; end if;

  select option_index into v_current
  from public.chat_poll_votes where message_id = p_message and user_id = auth.uid();

  if v_current is not null and v_current = p_option then
    delete from public.chat_poll_votes where message_id = p_message and user_id = auth.uid();
  else
    insert into public.chat_poll_votes (org_id, group_id, message_id, user_id, option_index)
    values (v_org, v_group, p_message, auth.uid(), p_option)
    on conflict (message_id, user_id) do update set option_index = excluded.option_index, created_at = now();
  end if;
end;
$$;

revoke all on function public.vote_chat_poll(uuid, int) from public;
grant execute on function public.vote_chat_poll(uuid, int) to authenticated;
