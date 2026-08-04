-- ===========================================================================
-- Team Hub Platform — 0037 create a workspace from a template
--
-- Lets a brand-new owner start from a ready-made app (pages + blocks + theme)
-- instead of a blank canvas. The template itself is defined in the frontend
-- (src/creator/templates.ts) and passed in as JSON; this function builds the
-- workspace atomically and publishes a first snapshot so it's immediately
-- viewable. It copies STRUCTURE only — no people, no roster/schedule/chat data.
--
-- p_settings: { theme?: jsonb, fontFamily?: text }  (rest use column defaults)
-- p_pages:    [ { name, icon?, slug, visibility?, blocks: [ { type, props?, visibility? } ] } ]
-- ===========================================================================

create or replace function public.create_workspace_from_template(
  p_name text, p_slug text, p_settings jsonb, p_pages jsonb
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      public.organizations;
  v_page     jsonb;
  v_block    jsonb;
  v_page_id  uuid;
  v_psort    int := 0;
  v_bsort    int;
begin
  if auth.uid() is null then
    raise exception 'sign in to create an app';
  end if;

  insert into public.organizations (name, slug)
  values (p_name, lower(p_slug))
  returning * into v_org;

  insert into public.memberships (user_id, org_id, role)
  values (auth.uid(), v_org.id, 'owner');

  -- App settings: name from the owner; theme/font from the template if given,
  -- otherwise the generic column defaults.
  insert into public.app_settings (org_id, app_name) values (v_org.id, p_name);
  if p_settings ? 'theme' and jsonb_typeof(p_settings->'theme') = 'object' then
    update public.app_settings set theme = p_settings->'theme' where org_id = v_org.id;
  end if;
  if nullif(p_settings->>'fontFamily', '') is not null then
    update public.app_settings set font_family = p_settings->>'fontFamily' where org_id = v_org.id;
  end if;

  -- Pages + their blocks, in order.
  for v_page in select * from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb))
  loop
    insert into public.pages (org_id, name, icon, slug, sort_order, is_published, visibility)
    values (
      v_org.id,
      coalesce(v_page->>'name', 'Page'),
      v_page->>'icon',
      coalesce(nullif(v_page->>'slug', ''), 'page-' || v_psort),
      v_psort,
      true,
      coalesce(v_page->'visibility', jsonb_build_object('kind', 'everyone'))
    )
    returning id into v_page_id;

    v_bsort := 0;
    for v_block in select * from jsonb_array_elements(coalesce(v_page->'blocks', '[]'::jsonb))
    loop
      insert into public.blocks (org_id, page_id, type, sort_order, props, visibility)
      values (
        v_org.id,
        v_page_id,
        v_block->>'type',
        v_bsort,
        coalesce(v_block->'props', '{}'::jsonb),
        coalesce(v_block->'visibility', jsonb_build_object('kind', 'everyone'))
      );
      v_bsort := v_bsort + 1;
    end loop;

    v_psort := v_psort + 1;
  end loop;

  -- Publish a snapshot so the new app is viewable right away (mirrors
  -- duplicate_workspace).
  insert into public.published_content (org_id, settings, pages, blocks, published_at)
  values (
    v_org.id,
    (select to_jsonb(s) from public.app_settings s where s.org_id = v_org.id),
    coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order)
              from public.pages p where p.org_id = v_org.id and p.is_published), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order)
              from public.blocks b
              where b.org_id = v_org.id
                and b.page_id in (select id from public.pages where org_id = v_org.id and is_published)),
             '[]'::jsonb),
    now()
  );

  return v_org;
end;
$$;

revoke all on function public.create_workspace_from_template(text, text, jsonb, jsonb) from public;
grant execute on function public.create_workspace_from_template(text, text, jsonb, jsonb) to authenticated;
