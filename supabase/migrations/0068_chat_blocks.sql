-- ===========================================================================
-- Team Hub Platform — 0068 block a person's messages
--
-- The other half of the app stores' user-generated-content rule: alongside
-- reporting, someone must be able to stop seeing a person who is bothering
-- them, without waiting for anyone to act on their report.
--
-- Blocking here is ONE-WAY and personal: it hides that person's messages from
-- the blocker, and changes nothing for anyone else. It is not mutual invisibility
-- like a social network. These are ministry teams — someone quietly hiding a
-- person they find difficult should not silently remove themselves from that
-- person's view of the channel, and a leader must not be able to make their own
-- messages unreadable to a volunteer by blocking them.
--
-- The blocked person's name is copied in rather than joined from auth.users:
-- the block list has to be able to say WHO you blocked, and reading other users'
-- rows is exactly the kind of access this table shouldn't need.
--
-- Plain RLS, no RPCs — every row is about the person reading it, which policies
-- express perfectly well on their own.
-- ===========================================================================

create table if not exists public.chat_blocks (
  blocker_id   uuid not null references auth.users(id) on delete cascade,
  blocked_id   uuid not null references auth.users(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  blocked_name text,
  created_at   timestamptz not null default now(),
  primary key (blocker_id, blocked_id, org_id)
);
create index if not exists chat_blocks_mine_idx on public.chat_blocks(blocker_id, org_id);

alter table public.chat_blocks enable row level security;

-- You can only ever see your own blocks. Being able to read who blocked whom
-- would make this feature worse than not having it.
drop policy if exists chat_blocks_select on public.chat_blocks;
create policy chat_blocks_select on public.chat_blocks
  for select to authenticated
  using (blocker_id = auth.uid());

-- Block someone: only on your own behalf, only inside an app you're in, and
-- not yourself.
drop policy if exists chat_blocks_insert on public.chat_blocks;
create policy chat_blocks_insert on public.chat_blocks
  for insert to authenticated
  with check (
    blocker_id = auth.uid()
    and blocked_id <> auth.uid()
    and public.is_org_member(org_id)
  );

-- Unblocking is always allowed, even if you've since left the app — otherwise a
-- stale row could outlive any way to remove it.
drop policy if exists chat_blocks_delete on public.chat_blocks;
create policy chat_blocks_delete on public.chat_blocks
  for delete to authenticated
  using (blocker_id = auth.uid());
