-- ===========================================================================
-- Team Hub Platform — Switch Leader starter workspace seed
--
-- Reproduces the reference "Switch Leader" app as EDITABLE DATA, built entirely
-- from the generic block palette (nothing Switch-specific is in the code). Run
-- this in the Supabase SQL Editor AFTER migrations 0001–0006.
--
-- It is safe to re-run: it attaches to an existing `switch` workspace if you
-- already created one (and makes you owner if needed), sets the Switch theme,
-- and seeds pages/blocks ONLY if the workspace has none yet.
--
-- 👉 Set your owner email on the next line if different.
-- ===========================================================================
do $$
declare
  v_email   text := 'tommy.stegmaier@life.church';
  v_uid     uuid;
  v_org     uuid;
  v_home    uuid;
  v_pid     uuid;
  v_navy    text := '#1c2541';
  v_red     text := '#e23b2e';
  names     text[] := array['Group Leader','Host Team','Check-In','Safety Team','Experience Team','Photography'];
  icons     text[] := array['🤘','😀','☑️','🚨','💻','📸'];
  slugs     text[] := array['group-leader','host-team','check-in','safety-team','experience-team','photography'];
  i         int;
begin
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    raise exception 'No auth user for %, sign up at /login first.', v_email;
  end if;

  -- Resolve (or create) the Switch workspace.
  select id into v_org from public.organizations where slug = 'switch';
  if v_org is null then
    insert into public.organizations (name, slug) values ('Switch Leader','switch') returning id into v_org;
    insert into public.app_settings (org_id, app_name) values (v_org, 'Switch Leader');
  end if;
  insert into public.memberships (user_id, org_id, role)
  values (v_uid, v_org, 'owner') on conflict (user_id, org_id) do nothing;

  -- Switch theme + identity (always applied).
  update public.app_settings set
    app_name = 'Switch Leader',
    theme = jsonb_build_object('background','#ffffff','text','#0f1420','primary','#0f1420','primaryText','#ffffff','accent', v_red,'heading', v_navy),
    nav_style = 'top',
    viewer_access = 'public'
  where org_id = v_org;

  -- Only seed content if the workspace is empty.
  if exists (select 1 from public.pages where org_id = v_org) then
    raise notice 'Switch workspace already has pages — theme updated, content left as-is.';
    return;
  end if;

  -- ---- PAGE 1: Home / hub ----
  insert into public.pages (org_id, name, icon, slug, sort_order, is_published)
  values (v_org, 'Switch Leader', '🔥', 'home', 0, true) returning id into v_home;

  insert into public.blocks (org_id, page_id, type, sort_order, props) values
  (v_org, v_home, 'image', 0, jsonb_build_object('url','','alt','Switch hero image','caption','LEADING STUDENTS TO BECOME FULLY DEVOTED FOLLOWERS OF CHRIST','width',100,'rounded',true,'overlay',false)),
  (v_org, v_home, 'divider', 1, jsonb_build_object('color','#0f1420','thickness',1,'margin',16)),
  (v_org, v_home, 'heading', 2, jsonb_build_object('text','Switch 🔥🙌','level',1,'align','left','underline',true)),
  (v_org, v_home, 'paragraph', 3, jsonb_build_object('html', '<p><span style="color:'||v_red||'">Important info for the coming weeks:</span></p><ul><li>Event date — TBD</li><li>Reminder — bring your team rosters</li></ul>','align','left')),
  (v_org, v_home, 'paragraph', 4, jsonb_build_object('html', '<p>See you at huddle at <strong>6:20pm</strong>!</p><p>Be sure to check <u>Weekly Team Information</u> for everything you need this week!</p>','align','left')),
  (v_org, v_home, 'divider', 5, jsonb_build_object('color','#0f1420','thickness',1,'margin',16)),
  (v_org, v_home, 'heading', 6, jsonb_build_object('text','Weekly Team Information','level',2,'align','center','underline',false)),
  (v_org, v_home, 'paragraph', 7, jsonb_build_object('html','<p>Click your team''s button below for your weekly need-to-know''s</p>','align','center')),
  (v_org, v_home, 'button', 8, jsonb_build_object('label','🤘 Group Leader','action',jsonb_build_object('type','page','target','group-leader'),'style','filled','align','center','fullWidth',true,'openInNewTab',false)),
  (v_org, v_home, 'button', 9, jsonb_build_object('label','😀 Host Team','action',jsonb_build_object('type','page','target','host-team'),'style','filled','align','center','fullWidth',true,'openInNewTab',false)),
  (v_org, v_home, 'button', 10, jsonb_build_object('label','☑️ Check-In','action',jsonb_build_object('type','page','target','check-in'),'style','filled','align','center','fullWidth',true,'openInNewTab',false)),
  (v_org, v_home, 'button', 11, jsonb_build_object('label','🚨 Safety Team','action',jsonb_build_object('type','page','target','safety-team'),'style','filled','align','center','fullWidth',true,'openInNewTab',false)),
  (v_org, v_home, 'button', 12, jsonb_build_object('label','💻 Experience Team','action',jsonb_build_object('type','page','target','experience-team'),'style','filled','align','center','fullWidth',true,'openInNewTab',false)),
  (v_org, v_home, 'button', 13, jsonb_build_object('label','📸 Photography','action',jsonb_build_object('type','page','target','photography'),'style','filled','align','center','fullWidth',true,'openInNewTab',false)),
  (v_org, v_home, 'divider', 14, jsonb_build_object('color','#0f1420','thickness',1,'margin',16)),
  (v_org, v_home, 'heading', 15, jsonb_build_object('text','🔗 Important Links','level',2,'align','center','underline',false)),
  (v_org, v_home, 'button', 16, jsonb_build_object('label','📅 Semester Calendar','action',jsonb_build_object('type','url','target',''),'style','filled','align','center','fullWidth',true,'openInNewTab',true)),
  (v_org, v_home, 'button', 17, jsonb_build_object('label','🔗 Helpful Resources','action',jsonb_build_object('type','url','target',''),'style','filled','align','center','fullWidth',true,'openInNewTab',true)),
  (v_org, v_home, 'button', 18, jsonb_build_object('label','📸 Photos From Wednesday Night','action',jsonb_build_object('type','url','target',''),'style','filled','align','center','fullWidth',true,'openInNewTab',true)),
  (v_org, v_home, 'card', 19, jsonb_build_object('title','Switch YouTube Channel','icon','▶️','columns',2,'action',jsonb_build_object('type','url','target',''))),
  (v_org, v_home, 'card', 20, jsonb_build_object('title','Switch Leader Podcast','icon','🎙️','columns',2,'action',jsonb_build_object('type','url','target',''))),
  (v_org, v_home, 'divider', 21, jsonb_build_object('color','#0f1420','thickness',1,'margin',16)),
  (v_org, v_home, 'button', 22, jsonb_build_object('label','🆕 New Leader Orientation','action',jsonb_build_object('type','url','target',''),'style','filled','align','center','fullWidth',true,'openInNewTab',true));

  -- ---- PAGES 2–7: team pages from a shared template ----
  for i in 1..array_length(names,1) loop
    insert into public.pages (org_id, name, icon, slug, sort_order, is_published)
    values (v_org, names[i], icons[i], slugs[i], i, true) returning id into v_pid;

    insert into public.blocks (org_id, page_id, type, sort_order, props) values
    (v_org, v_pid, 'heading', 0, jsonb_build_object('text', icons[i] || ' ' || names[i], 'level',1,'align','left','underline',true)),
    (v_org, v_pid, 'paragraph', 1, jsonb_build_object('html','<p><span style="color:'||v_navy||'">This week''s focus: <strong>BUILD GENUINE RELATIONSHIPS WITH EVERY STUDENT.</strong></span></p>','align','left')),
    (v_org, v_pid, 'paragraph', 2, jsonb_build_object('html','<p>A Christ-shaped life for ' || lower(names[i]) || ':</p><ul><li>Show up early and prayed-up</li><li>Know your students by name</li><li>Follow up during the week</li><li>Point every conversation to Jesus</li></ul>','align','left')),
    (v_org, v_pid, 'divider', 3, jsonb_build_object('color','#0f1420','thickness',1,'margin',16)),
    (v_org, v_pid, 'document', 4, jsonb_build_object('title','Switch Message Guide','url','','displayMode','inline')),
    (v_org, v_pid, 'button', 5, jsonb_build_object('label','🔗 Helpful Resources','action',jsonb_build_object('type','url','target',''),'style','filled','align','center','fullWidth',true,'openInNewTab',true)),
    (v_org, v_pid, 'button', 6, jsonb_build_object('label','🎉 You Said Yes Bible Plan','action',jsonb_build_object('type','url','target',''),'style','filled','align','center','fullWidth',true,'openInNewTab',true)),
    (v_org, v_pid, 'button', 7, jsonb_build_object('label','🎊 Student Leader Application','action',jsonb_build_object('type','url','target',''),'style','filled','align','center','fullWidth',true,'openInNewTab',true));
  end loop;

  -- Publish the seeded content so it's immediately live for viewers. (We write
  -- the snapshot directly because the SQL editor has no auth context for the
  -- publish RPC; the result is identical to clicking "Publish changes".)
  insert into public.published_content (org_id, settings, pages, blocks, published_at)
  values (
    v_org,
    (select to_jsonb(s) from public.app_settings s where s.org_id = v_org),
    coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order)
              from public.pages p where p.org_id = v_org and p.is_published), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order)
              from public.blocks b
              where b.org_id = v_org
                and b.page_id in (select id from public.pages where org_id = v_org and is_published)), '[]'::jsonb),
    now()
  )
  on conflict (org_id) do update
    set settings = excluded.settings, pages = excluded.pages,
        blocks = excluded.blocks, published_at = excluded.published_at;

  raise notice 'Switch starter workspace seeded and published at /o/switch';
end $$;
