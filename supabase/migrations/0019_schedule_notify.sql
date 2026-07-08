-- ===========================================================================
-- Team Hub Platform — 0019 saved schedule-notification message
--
-- Managers can save a default title + message used when they post the weekly
-- schedule and notify volunteers ("you're scheduled — confirm or decline").
-- They can still edit the text per send; this just stores the default.
-- ===========================================================================

alter table public.schedule_config add column if not exists notify_title text;
alter table public.schedule_config add column if not exists notify_message text;
