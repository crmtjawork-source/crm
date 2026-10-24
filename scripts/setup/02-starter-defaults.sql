-- Generic starter setup for a new organization: a pipeline with stages,
-- handling statuses, one meeting type and working hours. Everything here is
-- editable later in the app's settings.
--
-- Effectively REQUIRED for the pipeline: /pipeline renders nothing while an
-- org has zero pipelines (app/pipeline/page.tsx `if (!pipeline) return null`),
-- so the first pipeline can't be created from the UI. The rest is optional.
--
-- Run after 01-first-org-owner.sql. Edit the org name to match.

do $$
declare
  v_org_name text := 'שם העסק';   -- <-- same name as in 01-first-org-owner.sql
  v_org_id uuid;
  v_pipeline_id uuid;
begin
  select id into v_org_id from public.organizations where name = v_org_name;
  if v_org_id is null then raise exception 'No organization named %', v_org_name; end if;
  if exists (select 1 from public.pipelines where org_id = v_org_id) then
    raise exception 'Organization % already has a pipeline — nothing done.', v_org_name;
  end if;

  insert into public.pipelines (org_id, name) values (v_org_id, 'מכירות') returning id into v_pipeline_id;
  insert into public.stages (pipeline_id, name, win_probability, position, color) values
    (v_pipeline_id, 'ליד חדש',        10, 0, '#3b82f6'),
    (v_pipeline_id, 'בטיפול',         25, 1, '#8b5cf6'),
    (v_pipeline_id, 'נקבעה פגישה',    50, 2, '#f59e0b'),
    (v_pipeline_id, 'הצעת מחיר',      70, 3, '#ec4899'),
    (v_pipeline_id, 'משא ומתן',       85, 4, '#10b981');

  insert into public.lead_statuses (org_id, name, position, color) values
    (v_org_id, 'חדש',          0, '#3b82f6'),
    (v_org_id, 'אין מענה',     1, '#9ca3af'),
    (v_org_id, 'בטיפול',       2, '#8b5cf6'),
    (v_org_id, 'לא רלוונטי',   3, '#ef4444');

  insert into public.appointment_types (org_id, name, duration_minutes) values (v_org_id, 'פגישת היכרות', 30);

  -- Sunday–Thursday 09:00–18:00 (day 0 = Sunday).
  insert into public.availability_rules (org_id, day, start_time, end_time)
  select v_org_id, d, '09:00', '18:00' from generate_series(0, 4) d;

  raise notice 'Starter defaults created for %', v_org_name;
end $$;
