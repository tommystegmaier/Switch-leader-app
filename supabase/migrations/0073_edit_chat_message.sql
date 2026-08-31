-- ===========================================================================
-- Team Hub Platform — 0073 let people edit a message they sent
--
-- Typos in a group of a hundred leaders currently mean deleting and resending,
-- which loses the replies and reactions underneath. iMessage lets you fix the
-- text in place, and people expect that now.
--
-- Done as a function rather than an UPDATE policy on purpose. A policy broad
-- enough to allow editing would also allow rewriting user_id, group_id,
-- created_at or image_url — so the author of a harmless message could reassign
-- it to someone else, move it into a channel they can't post in, or swap the
-- attached photo while leaving the text that people already approved. This
-- touches two columns and nothing else can be reached.
--
-- Every edit is stamped, and the app shows "Edited" from then on. Silently
-- changing what someone said in a group conversation, after others have
-- replied to it, is not something an app should make possible.
-- ===========================================================================

alter table public.chat_messages add column if not exists edited_at timestamptz;

create or replace function public.edit_chat_message(p_message uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_msg public.chat_messages; v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'sign in to edit a message'; end if;
  if v_body = '' then raise exception 'a message can''t be empty — delete it instead'; end if;

  select * into v_msg from public.chat_messages where id = p_message;
  if v_msg.id is null then raise exception 'that message is no longer there'; end if;

  -- Authors only. Deliberately NOT extended to moderators: a manager who
  -- objects to a message can already delete it, and putting words in someone
  -- else's mouth under their name is a different power entirely.
  if v_msg.user_id <> auth.uid() then
    raise exception 'you can only edit your own messages';
  end if;

  -- A poll's text is its question, and rewriting that after people have voted
  -- silently changes what their answers meant.
  if v_msg.poll is not null then
    raise exception 'a poll question can''t be edited — delete it and post a new one';
  end if;

  update public.chat_messages
     set body = v_body, edited_at = now()
   where id = p_message;
end;
$$;
revoke all on function public.edit_chat_message(uuid, text) from public;
grant execute on function public.edit_chat_message(uuid, text) to authenticated;
