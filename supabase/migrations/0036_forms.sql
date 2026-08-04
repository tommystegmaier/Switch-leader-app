-- ===========================================================================
-- Team Hub Platform — 0036 forms & submissions
--
-- The Form block collects input from an app's viewers (sign-ups, RSVPs,
-- contact/requests, surveys). The form's DESIGN lives in the block's props
-- (published with the page like any other block); the SUBMITTED DATA lands
-- here, one row per submission, scoped to the workspace and the specific form
-- block that produced it. Only owners/admins can read a workspace's responses.
--
-- All access goes through SECURITY DEFINER RPCs (RLS is on with no direct
-- policies), so anonymous viewers of a public app can submit, but nobody can
-- read another workspace's data.
-- ===========================================================================

create table if not exists public.form_submissions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  block_id     uuid not null,                 -- the Form block that collected it
  page_slug    text,                          -- where it lived (for context)
  form_title   text,                          -- denormalized so it reads well later
  data         jsonb not null default '[]'::jsonb, -- [{ label, value }, …] in field order
  submitted_by uuid references auth.users(id) on delete set null, -- null = anonymous
  created_at   timestamptz not null default now()
);

create index if not exists form_submissions_org_block_idx
  on public.form_submissions(org_id, block_id, created_at desc);

alter table public.form_submissions enable row level security;
-- Intentionally NO policies: every read/write goes through the RPCs below.

-- --- submit a response (any viewer of a public app, or any member) ----------
create or replace function public.submit_form(
  p_org uuid, p_block uuid, p_page text, p_title text, p_data jsonb
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
  -- Whoever can VIEW the app can submit: public apps allow anyone, invite-only
  -- apps require membership.
  if not (public.org_is_public(p_org) or public.is_org_member(p_org)) then
    raise exception 'not allowed to submit to this form';
  end if;

  insert into public.form_submissions (org_id, block_id, page_slug, form_title, data, submitted_by)
  values (p_org, p_block, p_page, p_title, coalesce(p_data, '[]'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_form(uuid, uuid, text, text, jsonb) from public;
grant execute on function public.submit_form(uuid, uuid, text, text, jsonb) to anon, authenticated;

-- --- read responses for one form (owners/admins only) -----------------------
create or replace function public.list_form_submissions(p_org uuid, p_block uuid)
returns table (id uuid, data jsonb, submitter_email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can view responses';
  end if;
  return query
    select s.id, s.data, u.email::text, s.created_at
    from public.form_submissions s
    left join auth.users u on u.id = s.submitted_by
    where s.org_id = p_org and s.block_id = p_block
    order by s.created_at desc;
end;
$$;

revoke all on function public.list_form_submissions(uuid, uuid) from public;
grant execute on function public.list_form_submissions(uuid, uuid) to authenticated;

-- --- count responses for one form (for the "View responses (N)" badge) ------
create or replace function public.count_form_submissions(p_org uuid, p_block uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    return 0;
  end if;
  select count(*) into v_n from public.form_submissions
  where org_id = p_org and block_id = p_block;
  return coalesce(v_n, 0);
end;
$$;

revoke all on function public.count_form_submissions(uuid, uuid) from public;
grant execute on function public.count_form_submissions(uuid, uuid) to authenticated;

-- --- delete a single response (owners/admins only) --------------------------
create or replace function public.delete_form_submission(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.form_submissions where id = p_id;
  if v_org is null then return; end if;
  if not public.has_org_role(v_org, array['owner','admin']) then
    raise exception 'only an owner or admin can delete responses';
  end if;
  delete from public.form_submissions where id = p_id;
end;
$$;

revoke all on function public.delete_form_submission(uuid) from public;
grant execute on function public.delete_form_submission(uuid) to authenticated;
