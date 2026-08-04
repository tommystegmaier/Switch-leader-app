-- ===========================================================================
-- Team Hub Platform — 0039 forms: one submission per person
--
-- Adds an optional "limit to one submission per person" mode to the Form block.
-- When on, a SIGNED-IN person can only submit once (enforced here, server-side),
-- and the form hides itself from their view afterward. For anonymous viewers of
-- a public app there's no identity to key on, so the client hides it per-device
-- (best effort) — the hard limit only applies to signed-in users.
-- ===========================================================================

-- Recreate submit_form with a p_once flag (drops the 0036 signature first).
drop function if exists public.submit_form(uuid, uuid, text, text, jsonb);

create or replace function public.submit_form(
  p_org uuid, p_block uuid, p_page text, p_title text, p_data jsonb, p_once boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_org is null or p_block is null then
    raise exception 'missing form target';
  end if;
  if not (public.org_is_public(p_org) or public.is_org_member(p_org)) then
    raise exception 'not allowed to submit to this form';
  end if;

  -- One-per-person: only enforceable for signed-in users.
  if p_once and auth.uid() is not null then
    if exists (
      select 1 from public.form_submissions
      where org_id = p_org and block_id = p_block and submitted_by = auth.uid()
    ) then
      raise exception 'already submitted';
    end if;
  end if;

  insert into public.form_submissions (org_id, block_id, page_slug, form_title, data, submitted_by)
  values (p_org, p_block, p_page, p_title, coalesce(p_data, '[]'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_form(uuid, uuid, text, text, jsonb, boolean) from public;
grant execute on function public.submit_form(uuid, uuid, text, text, jsonb, boolean) to anon, authenticated;

-- Has the current caller already submitted this form? (false for anonymous —
-- `submitted_by = auth.uid()` is never true when auth.uid() is null.)
create or replace function public.has_submitted_form(p_org uuid, p_block uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.form_submissions
    where org_id = p_org and block_id = p_block and submitted_by = auth.uid()
  );
$$;

revoke all on function public.has_submitted_form(uuid, uuid) from public;
grant execute on function public.has_submitted_form(uuid, uuid) to anon, authenticated;
