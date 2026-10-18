-- Ready-made messages agents send from their own WhatsApp (the CRM opens
-- WhatsApp with the text filled in), and the lead-card quick actions that
-- use them.

-- quick_action ties a template to a lead-card button: no_answer_1..4,
-- meeting_online, meeting_office, meeting_reminder_3d, meeting_reminder_1d,
-- meeting_reminder_day, after_meeting. Null = only picked by hand.
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  body text not null default '',
  quick_action text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index message_templates_org_idx on message_templates (org_id);
create unique index message_templates_org_action_key on message_templates (org_id, quick_action) where quick_action is not null;

-- "No answer" attempts so far; the next attempt picks no_answer_<n+1>.
alter table contacts add column no_answer_count integer not null default 0;

-- A task can carry a message to send (e.g. a meeting reminder) and the
-- meeting it refers to, so the task list offers "send on WhatsApp".
alter table tasks add column template_id uuid references message_templates(id) on delete set null;
alter table tasks add column appointment_id uuid references appointments(id) on delete cascade;

alter table message_templates enable row level security;
create policy "members read message_templates" on message_templates for select
  using (org_id in (select my_org_ids()));
create policy "admins manage message_templates" on message_templates for all
  using (org_id in (select my_admin_org_ids()))
  with check (org_id in (select my_admin_org_ids()));
