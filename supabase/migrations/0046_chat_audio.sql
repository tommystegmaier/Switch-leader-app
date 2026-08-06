-- ===========================================================================
-- Team Hub Platform — 0046 chat audio (voice) messages
--
-- Adds voice messages to chat. Audio is tiny compared to video (a few MB for a
-- multi-minute recording), so it fits comfortably under the free storage cap.
-- Video sending is being retired in the app UI, but existing video messages
-- keep rendering and keep expiring on their old schedule — this migration only
-- ADDS audio; it removes nothing.
--
--   • audio_url  → the uploaded voice recording (public URL, like image/video)
--   • media_kind → now also allows 'audio'
-- ===========================================================================

alter table public.chat_messages add column if not exists audio_url text;
-- media_kind is a free-text tag ('photo' | 'gif' | 'video' | 'audio'); no enum
-- to alter, but note the widened set here for the record.

-- Allow a message that carries only audio (body/image/video/poll were the only
-- things that satisfied the media check before).
alter table public.chat_messages drop constraint if exists chat_messages_media_check;
alter table public.chat_messages add constraint chat_messages_media_check
  check (
    coalesce(body, '') <> ''
    or coalesce(image_url, '') <> ''
    or coalesce(video_url, '') <> ''
    or coalesce(audio_url, '') <> ''
    or poll is not null
  );
