-- ===========================================================================
-- Team Hub Platform — 0024 shared checklist toggle
--
-- Lets owner/admin/editor tick a checklist item in the LIVE (published) view
-- and have it stick for everyone. Updates both the live block and the
-- published snapshot so viewers (who read the snapshot) see the new state.
-- The client sends the new sanitized HTML for the block (just the toggled
-- data-checked attribute changes).
-- ===========================================================================

create or replace function public.toggle_checklist(p_block uuid, p_html text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.blocks where id = p_block;
  if v_org is null then raise exception 'block not found'; end if;
  if not public.has_org_role(v_org, array['owner','admin','editor']) then
    raise exception 'only a manager can change this';
  end if;

  update public.blocks
    set props = jsonb_set(props, '{html}', to_jsonb(p_html))
    where id = p_block;

  update public.published_content
    set blocks = coalesce((
      select jsonb_agg(
        case when (elem->>'id')::uuid = p_block
          then jsonb_set(elem, '{props,html}', to_jsonb(p_html))
          else elem end)
      from jsonb_array_elements(blocks) elem
    ), blocks)
    where org_id = v_org;
end;
$$;

revoke all on function public.toggle_checklist(uuid, text) from public;
grant execute on function public.toggle_checklist(uuid, text) to authenticated;
