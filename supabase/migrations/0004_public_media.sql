-- ===========================================================================
-- Team Hub Platform — 0004 make the media bucket public-read
--
-- Why: uploaded images/PDFs render in the browser via a stable public URL,
-- with no expiring signed-token complexity. WRITES remain locked to editor+
-- of the owning org (the media_write policy in 0003 is unchanged), so viewers
-- still cannot upload or replace files.
--
-- Trade-off: a public bucket means media objects are reachable by anyone who
-- has the (unguessable, org-scoped) direct URL — even for invite_only
-- workspaces. For a content/resource hub this mirrors "anyone with the link".
-- To enforce strict per-workspace media privacy instead, keep the bucket
-- private and serve via short-lived signed URLs (documented in README).
-- ===========================================================================

update storage.buckets set public = true where id = 'media';
