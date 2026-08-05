-- ===========================================================================
-- Team Hub Platform — 0043 chat video + media expiry
--
-- Adds video messages to chat and tags every media message with its kind
-- (photo / gif / video) so a scheduled cleanup can auto-remove old media and
-- keep storage from piling up:
--   • videos  → removed after 2 weeks
--   • gifs    → removed after 1 month  (hotlinked, so this just clears the msg)
--   • photos  → removed after 2 months
-- The cleanup runs in functions/api/media-cleanup.ts (call it daily from cron).
-- ===========================================================================

alter table public.chat_messages add column if not exists video_url  text;
alter table public.chat_messages add column if not exists media_kind text; -- 'photo' | 'gif' | 'video'

-- Allow a message that carries only a video (previously body or image required).
-- The original inline CHECK is auto-named public.chat_messages_check.
alter table public.chat_messages drop constraint if exists chat_messages_check;
alter table public.chat_messages add constraint chat_messages_media_check
  check (
    coalesce(body, '') <> ''
    or coalesce(image_url, '') <> ''
    or coalesce(video_url, '') <> ''
    or poll is not null
  );

-- Backfill kinds for existing image messages: GIPHY links are gifs, the rest
-- are uploaded photos.
update public.chat_messages
   set media_kind = case
     when image_url ilike '%giphy.com%' then 'gif'
     else 'photo'
   end
 where media_kind is null and coalesce(image_url, '') <> '';

create index if not exists chat_messages_media_kind_idx on public.chat_messages(media_kind, created_at);
