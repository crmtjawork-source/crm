-- Automations on custom-object records (clients, properties…): created,
-- stage changed, field changed. The database notices every change — from any
-- screen, the board, an import — and queues a run that the cron executes.

alter type automation_trigger_type add value if not exists 'record_created';
alter type automation_trigger_type add value if not exists 'record_stage_changed';
alter type automation_trigger_type add value if not exists 'record_field_changed';
alter type automation_step_type add value if not exists 'update_field';
alter type automation_step_type add value if not exists 'create_task';

alter table automations add column trigger_object_type_id uuid references object_types(id) on delete cascade;
alter table automations add column trigger_field text;   -- field key (field_changed)
alter table automations add column trigger_value text;   -- stage / field value, null = any

alter table automation_steps add column field_key text;     -- update_field
alter table automation_steps add column field_value text;
alter table automation_steps add column task_title text;    -- create_task
alter table automation_steps add column task_due_days integer;

alter table automation_runs alter column contact_id drop not null;
alter table automation_runs add column record_id uuid references records(id) on delete cascade;
alter table automation_runs add constraint automation_runs_target_check check (contact_id is not null or record_id is not null);
create index automation_runs_record_idx on automation_runs (record_id);

-- Queues runs for the automations a record change matches. Changes made by
-- an automation step (see automation_set_record_field) don't trigger further
-- automations, so two rules can never loop.
create or replace function queue_record_automations() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a automations;
  stage_key text;
begin
  if coalesce(current_setting('crm.from_automation', true), '') = '1' then
    return new;
  end if;
  select stage_field into stage_key from object_types where id = new.object_type_id;
  for a in
    select * from automations
    where org_id = new.org_id and active and trigger_object_type_id = new.object_type_id
      and trigger_type in ('record_created', 'record_stage_changed', 'record_field_changed')
  loop
    if a.trigger_type = 'record_created' and tg_op <> 'INSERT' then continue; end if;
    if a.trigger_type = 'record_stage_changed' then
      if stage_key is null then continue; end if;
      if tg_op = 'UPDATE' and (old.data ->> stage_key) is not distinct from (new.data ->> stage_key) then continue; end if;
      if tg_op = 'INSERT' and (new.data ->> stage_key) is null then continue; end if;
      if a.trigger_value is not null and a.trigger_value is distinct from (new.data ->> stage_key) then continue; end if;
    end if;
    if a.trigger_type = 'record_field_changed' then
      if a.trigger_field is null then continue; end if;
      if tg_op = 'UPDATE' and (old.data -> a.trigger_field) is not distinct from (new.data -> a.trigger_field) then continue; end if;
      if tg_op = 'INSERT' and (new.data -> a.trigger_field) is null then continue; end if;
      if a.trigger_value is not null and a.trigger_value is distinct from (new.data ->> a.trigger_field) then continue; end if;
    end if;
    insert into automation_runs (org_id, automation_id, record_id, contact_id, status, steps_log, next_step_position, resume_at)
    values (new.org_id, a.id, new.id, new.contact_id, 'waiting', '{}', 0, now());
  end loop;
  return new;
end;
$$;
create trigger records_queue_automations after insert or update of data on records
  for each row execute function queue_record_automations();

-- Used by the "update field" step: the change itself won't re-trigger automations.
create or replace function automation_set_record_field(p_record uuid, p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('crm.from_automation', '1', true);
  update records set data = jsonb_set(data, array[p_key], p_value) where id = p_record;
  perform set_config('crm.from_automation', '', true);
end;
$$;
revoke execute on function automation_set_record_field(uuid, text, jsonb) from public, anon, authenticated;
