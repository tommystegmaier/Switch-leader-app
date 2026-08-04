-- ===========================================================================
-- Team Hub Platform — 0040 form responses: show the submitter's name
--
-- Responses only carried the submitter's email. Also return their display name
-- (from their account profile, raw_user_meta_data.full_name/name) so the view
-- and CSV can show a real name instead of an email. Falls back to null when the
-- person is anonymous or hasn't set a name.
-- ===========================================================================

drop function if exists public.list_form_submissions(uuid, uuid);

create or replace function public.list_form_submissions(p_org uuid, p_block uuid)
returns table (id uuid, data jsonb, submitter_name text, submitter_email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can view responses';
  end if;
  return query
    select
      s.id,
      s.data,
      nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '') as submitter_name,
      u.email::text as submitter_email,
      s.created_at
    from public.form_submissions s
    left join auth.users u on u.id = s.submitted_by
    where s.org_id = p_org and s.block_id = p_block
    order by s.created_at desc;
end;
$$;

revoke all on function public.list_form_submissions(uuid, uuid) from public;
grant execute on function public.list_form_submissions(uuid, uuid) to authenticated;
