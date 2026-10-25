-- DEMO ONLY: fills an organization with made-up data so every screen has
-- something to show (leads in all stages, deals, notes, tasks, meetings,
-- ready-made messages, a custom table, a document template, campaigns, an
-- intake URL and a couple of automations). Names and phone numbers are
-- fictional (phones are 050-0000xxx). Never run it on a real customer's org.
--
-- Run after 01 + 02, with the same org name. Re-running is refused.

do $$
declare
  v_org_name text := 'שם העסק';   -- <-- same name as in 01/02
  v_org uuid;
  v_owner_email text;
  v_pipeline uuid;
  v_stages uuid[];
  v_type uuid;
  v_campaigns uuid[];
  v_obj uuid;
  v_stage_field_opts jsonb;
  v_contact uuid;
  v_stage uuid;
  i int;
  names text[] := array[
    'נועה כהן','איתי לוי','מיכל אברהם','יונתן מזרחי','שירה פרץ','עומר ביטון','הדס פרידמן','אלון שפירא',
    'רוני דהן','תמר אזולאי','גיל רוזן','מאיה גולן','דניאל חדד','ליאת סגל','אסף קרמר','יעל ברק',
    'עידן אוחיון','קרן וייס','נדב אשכנזי','ענבל טל','רועי שלום','סתיו נחום','אביב כץ','טליה רז'];
  sources text[] := array['פייסבוק','גוגל','אתר','המלצה','אינסטגרם','וואטסאפ'];
  statuses text[] := array['חדש','אין מענה','בטיפול','בטיפול','חדש','לא רלוונטי'];
begin
  select id into v_org from public.organizations where name = v_org_name;
  if v_org is null then raise exception 'No organization named %', v_org_name; end if;
  if exists (select 1 from public.contacts where org_id = v_org) then
    raise exception 'Organization % already has leads — demo data not added.', v_org_name;
  end if;
  select u.email into v_owner_email from public.memberships m join public.users u on u.id = m.user_id
   where m.org_id = v_org and m.role = 'owner' limit 1;

  select id into v_pipeline from public.pipelines where org_id = v_org order by created_at limit 1;
  if v_pipeline is null then raise exception 'Run 02-starter-defaults.sql first.'; end if;
  select array_agg(id order by position) into v_stages from public.stages where pipeline_id = v_pipeline;
  select id into v_type from public.appointment_types where org_id = v_org limit 1;

  -- Campaigns + spend (last 30 days) + an intake URL.
  insert into public.campaigns (org_id, name, platform) values
    (v_org, 'קמפיין לידים — סתיו', 'meta'), (v_org, 'חיפוש ממומן — מותג', 'google'), (v_org, 'רימרקטינג', 'meta');
  select array_agg(id order by name) into v_campaigns from public.campaigns where org_id = v_org;
  insert into public.campaign_spend (org_id, campaign_id, day, amount, source)
  select v_org, c, (current_date - d), round((80 + random() * 220)::numeric, 0), 'manual'
    from unnest(v_campaigns) c, generate_series(0, 29) d;
  insert into public.lead_sources (org_id, name, default_platform, default_campaign_id)
  values (v_org, 'דף נחיתה — טופס צור קשר', 'website', v_campaigns[1]);

  -- Lead fields.
  insert into public.contact_field_defs (org_id, name, type, position, show_in_list) values
    (v_org, 'תקציב', 'number', 0, true), (v_org, 'עיר', 'text', 1, true), (v_org, 'מועד רצוי', 'date', 2, false);

  -- Leads, one deal each, notes, tasks.
  for i in 1 .. array_length(names, 1) loop
    insert into public.contacts (org_id, name, phone, email, source, tags, fields, owner_email, campaign_id, handling_status, created_at, last_activity_at)
    values (
      v_org, names[i], '050-0000' || lpad((100 + i)::text, 3, '0'), 'demo' || i || '@example.com',
      sources[1 + (i % array_length(sources, 1))],
      case when i % 4 = 0 then array['VIP'] when i % 5 = 0 then array['חוזר'] else '{}' end,
      jsonb_build_object('תקציב', (5 + (i * 7) % 40) * 1000, 'עיר', (array['תל אביב','חיפה','ירושלים','ראשון לציון','פתח תקווה'])[1 + i % 5]),
      case when i % 3 = 0 then null else v_owner_email end,
      v_campaigns[1 + (i % 3)],
      statuses[1 + (i % array_length(statuses, 1))],
      now() - make_interval(days => 30 - i, hours => i),
      now() - make_interval(days => (30 - i) / 3, hours => i)
    ) returning id into v_contact;

    v_stage := v_stages[1 + (i % array_length(v_stages, 1))];
    insert into public.opportunities (org_id, contact_id, pipeline_id, stage_id, title, value, status, closed_at, lost_reason, created_at, stage_changed_at)
    values (v_org, v_contact, v_pipeline, v_stage, 'עסקה — ' || names[i], (5 + (i * 7) % 40) * 1000,
      case when i % 7 = 0 then 'won'::opportunity_status when i % 9 = 0 then 'lost'::opportunity_status else 'open'::opportunity_status end,
      case when i % 7 = 0 or i % 9 = 0 then now() - make_interval(days => i % 5) end,
      case when i % 9 = 0 then 'מחיר' end,
      now() - make_interval(days => 30 - i), now() - make_interval(days => i % 6));

    insert into public.activities (org_id, contact_id, type, text, created_at) values
      (v_org, v_contact, 'note', 'שיחת היכרות ראשונה — מתעניין/ת, לחזור עם הצעה.', now() - make_interval(days => (30 - i) / 2));

    if i % 2 = 0 then
      insert into public.tasks (org_id, title, contact_id, due_date, done)
      values (v_org, 'לחזור ל' || names[i], v_contact, current_date + (i % 5) - 2, i % 6 = 0);
    end if;

    if i % 4 = 1 and v_type is not null then
      insert into public.appointments (org_id, contact_id, type_id, title, start_at, end_at)
      values (v_org, v_contact, v_type, 'פגישה עם ' || names[i],
        date_trunc('hour', now()) + make_interval(days => i % 7, hours => 2),
        date_trunc('hour', now()) + make_interval(days => i % 7, hours => 2, mins => 30));
    end if;
  end loop;

  -- Ready-made messages (WhatsApp quick actions).
  insert into public.message_templates (org_id, name, body, quick_action, position) values
    (v_org, 'ללא מענה — ניסיון 1', 'היי {{first_name}}, ניסיתי להשיג אותך בנוגע לפנייה שלך. מתי נוח לדבר?', 'no_answer_1', 0),
    (v_org, 'אישור פגישה', 'היי {{first_name}}, מאשר/ת את הפגישה שלנו ב-{{meeting_date}} בשעה {{meeting_time}}. נתראה!', 'meeting_online', 1),
    (v_org, 'תזכורת יום לפני', 'תזכורת: מחר ב-{{meeting_time}} נפגשים. אם משהו השתנה, אפשר לקבוע מחדש כאן: {{booking_link}}', 'meeting_reminder_1d', 2),
    (v_org, 'שליחת הצעה', 'היי {{first_name}}, מצורפת ההצעה שדיברנו עליה לעיון וחתימה: {{document_link}}', 'send_document', 3);

  -- A custom table ("פרויקטים") with a stage field and a few records.
  v_stage_field_opts := '[{"value":"o_new","label":"חדש","color":"#2563eb"},{"value":"o_wip","label":"בביצוע","color":"#ca8a04"},{"value":"o_done","label":"הסתיים","color":"#059669"}]';
  insert into public.object_types (org_id, name, singular, icon, position, title_field, stage_field)
  values (v_org, 'פרויקטים', 'פרויקט', '📁', 0, 'name', 'stage') returning id into v_obj;
  insert into public.object_fields (org_id, object_type_id, key, label, type, options, required, show_in_list, position) values
    (v_org, v_obj, 'name',  'שם',      'text',     '[]', true,  true, 0),
    (v_org, v_obj, 'stage', 'שלב',     'select',   v_stage_field_opts, false, true, 1),
    (v_org, v_obj, 'budget','תקציב',   'currency', '[]', false, true, 2),
    (v_org, v_obj, 'due',   'תאריך יעד','date',    '[]', false, true, 3);
  insert into public.records (org_id, object_type_id, title, data, owner_email)
  select v_org, v_obj, t.title, jsonb_build_object('name', t.title, 'stage', t.stage, 'budget', t.budget, 'due', (current_date + t.days)::text), v_owner_email
    from (values ('שיפוץ משרד — קומה 3','o_wip',45000,20), ('אתר תדמית','o_new',18000,45), ('מיתוג מחדש','o_done',30000,-10), ('קמפיין השקה','o_wip',25000,12)) t(title, stage, budget, days);

  -- A proposal template.
  insert into public.document_templates (org_id, name, title, accent_color, sections, signer_fields, expiry_days, default_value)
  values (v_org, 'הצעת מחיר בסיסית', 'הצעת מחיר', '#2563eb',
    '[{"id":"s1","title":"על הפרויקט","body":"שלום {{name}},\nבהמשך לשיחתנו, מצורפת הצעת המחיר לפרויקט."},{"id":"s2","title":"מה כלול","body":"• אפיון ותכנון\n• ביצוע\n• ליווי חודש אחרי מסירה"},{"id":"s3","title":"תנאי תשלום","body":"30% במעמד החתימה, 70% במסירה."}]',
    array['id_number','email'], 14, 20000);

  -- Automations (inactive, so nothing is sent from the demo).
  insert into public.automations (org_id, name, active, trigger_type) values (v_org, 'ליד חדש → משימת שיחה', false, 'new_contact') returning id into v_obj;
  insert into public.automation_steps (automation_id, type, position, task_title, task_due_days) values (v_obj, 'create_task', 0, 'להתקשר לליד חדש', 0);
  insert into public.automations (org_id, name, active, trigger_type) values (v_org, 'הצעה נחתמה → התראה', false, 'document_signed') returning id into v_obj;
  insert into public.automation_steps (automation_id, type, position, notify_text) values (v_obj, 'notify', 0, 'הצעה נחתמה! 🎉');

  raise notice 'Demo data added to %', v_org_name;
end $$;
