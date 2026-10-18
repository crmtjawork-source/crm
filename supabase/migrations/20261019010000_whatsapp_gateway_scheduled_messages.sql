-- Unofficial WhatsApp gateway (Green-API): an agent links their own
-- WhatsApp as a linked device by scanning a QR code, and the CRM sends
-- and receives through it. Lives next to the official Cloud API channels.
alter type channel_provider add value if not exists 'green_api';

-- Gateway connection state as last reported (authorized, notAuthorized,
-- blocked, …) and when.
alter table channels add column status text;
alter table channels add column status_checked_at timestamptz;

-- green_api: access_token = apiTokenInstance, external_id = idInstance,
-- api_url = the instance's API host. webhook_secret authenticates the
-- gateway's calls to /api/webhooks/green-api/<secret>.
alter table channel_credentials add column api_url text;
alter table channel_credentials add column webhook_secret text unique;

-- Messages to send later (meeting reminders…). Picked up by the cron job.
-- Deleting the meeting deletes its pending reminders.
create table scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  template_id uuid references message_templates(id) on delete set null,
  appointment_id uuid references appointments(id) on delete cascade,
  label text not null default '',
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  error text,
  created_by uuid references users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index scheduled_messages_due_idx on scheduled_messages (send_at) where status = 'pending';
create index scheduled_messages_contact_idx on scheduled_messages (contact_id);

alter table scheduled_messages enable row level security;
create policy "members read scheduled_messages" on scheduled_messages for select
  using (org_id in (select my_org_ids()));
create policy "members cancel scheduled_messages" on scheduled_messages for update
  using (org_id in (select my_org_ids()));

alter publication supabase_realtime add table scheduled_messages;
