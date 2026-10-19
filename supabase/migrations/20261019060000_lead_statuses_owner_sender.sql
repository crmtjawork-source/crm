-- Handling status: a second, per-business list next to the pipeline stage
-- ("waiting", "no answer 1", "handled"…). Automations can fire on it, and
-- send from the lead owner's own WhatsApp using the ready-made messages.

create table lead_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
alter table lead_statuses enable row level security;
create policy "members read lead_statuses" on lead_statuses for select using (org_id in (select my_org_ids()));
create policy "admins manage lead_statuses" on lead_statuses for all
  using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

alter table contacts add column handling_status text;
create index contacts_org_handling_idx on contacts (org_id, handling_status);

-- New leads start in the business's first status.
create or replace function default_handling_status() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.handling_status is null then
    select name into new.handling_status from lead_statuses where org_id = new.org_id order by position, created_at limit 1;
  end if;
  return new;
end;
$$;
create trigger contacts_default_handling_status before insert on contacts
  for each row execute function default_handling_status();

alter type automation_trigger_type add value if not exists 'status_changed';
alter table automations add column trigger_status text;

-- sender: 'channel' = the step's channel (or the org default); 'owner' = the
-- lead owner's linked WhatsApp. message_template_id = a ready-made message.
alter table automation_steps add column sender text not null default 'channel' check (sender in ('channel', 'owner'));
alter table automation_steps add column message_template_id uuid references message_templates(id) on delete set null;
