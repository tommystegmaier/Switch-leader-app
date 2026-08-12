-- ===========================================================================
-- Team Hub Platform — 0058 let members upload chat media (voice, photos)
--
-- Bug: storage writes were editor-and-above only (media_write in 0003, a single
-- FOR ALL policy). Regular members — the leaders actually using group chat —
-- got a permission error when sending a voice message or photo, while owners/
-- admins/editors worked fine, which is why it looked like "audio is broken."
--
-- Fix, split by operation so we don't over-grant:
--   • INSERT  → any member of the org (they need to attach chat media)
--   • UPDATE/DELETE → editor and above (so a viewer still can't overwrite or
--     delete the app logo, icon, or anyone else's uploads)
--   • SELECT  → unchanged (members, or anyone if the workspace is public)
--
-- Storage growth stays bounded: photos are compressed client-side and the
-- media-cleanup cron removes old chat media on a schedule.
-- ===========================================================================

drop policy if exists media_write on storage.objects;

-- Upload: any member of the owning org (path is "{orgId}/…").
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.is_org_member( public.uuid_or_null((storage.foldername(name))[1]) )
  );

-- Change/remove an existing object: editor and above only.
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and public.has_org_role(public.uuid_or_null((storage.foldername(name))[1]), array['owner','admin','editor'])
  )
  with check (
    bucket_id = 'media'
    and public.has_org_role(public.uuid_or_null((storage.foldername(name))[1]), array['owner','admin','editor'])
  );

drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and public.has_org_role(public.uuid_or_null((storage.foldername(name))[1]), array['owner','admin','editor'])
  );

-- Safety net: make sure the audio column + relaxed media check from 0046 are in
-- place, so an audio-only message can actually be saved (harmless if already
-- applied).
alter table public.chat_messages add column if not exists audio_url text;
alter table public.chat_messages drop constraint if exists chat_messages_media_check;
alter table public.chat_messages add constraint chat_messages_media_check
  check (
    coalesce(body, '') <> ''
    or coalesce(image_url, '') <> ''
    or coalesce(video_url, '') <> ''
    or coalesce(audio_url, '') <> ''
    or poll is not null
  );
