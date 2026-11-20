-- (A) Automations that survive a disconnected / unconfigured WhatsApp.
-- Per send step: channel_mode 'whatsapp' (strict: wait for WhatsApp) or 'auto'
-- (WhatsApp if connected, else the fallback); fallback = what to do instead.
-- NULL = the org default (organizations.automation_defaults).
alter table automation_steps add column if not exists channel_mode text check (channel_mode in ('whatsapp', 'auto'));
alter table automation_steps add column if not exists fallback text check (fallback in ('hold', 'task', 'notify', 'email', 'skip'));
-- {"channel_mode":"auto","fallback":"task","hold_expire_hours":72}
alter table organizations add column if not exists automation_defaults jsonb not null default '{}';

-- Sends an automation could not make because WhatsApp was down / not set up.
-- The run goes on with its other steps; the send waits here and is released
-- (once, claimed atomically) when a channel is connected again.
create table if not exists automation_held_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null references automation_runs(id) on delete cascade,
  automation_id uuid references automations(id) on delete cascade,
  step_id uuid references automation_steps(id) on delete set null,
  step_position int not null,
  contact_id uuid references contacts(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled', 'expired')),
  reason text,
  error text,
  held_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (run_id, step_position)
);
create index if not exists automation_held_sends_org_idx on automation_held_sends (org_id, status);
alter table automation_held_sends enable row level security;
create policy "members read automation_held_sends" on automation_held_sends for select using (org_id in (select my_org_ids()));
alter publication supabase_realtime add table automation_held_sends;

-- Scheduled messages (meeting reminders…) waiting for WhatsApp stay pending and say why.
alter table scheduled_messages add column if not exists hold_reason text;
alter table scheduled_messages add column if not exists held_at timestamptz;

-- (B) WhatsApp groups per org, tagged with a kind the org defines ("מכירות", "תפעול"…),
-- and their members matched to leads by phone number.
alter table organizations add column if not exists wa_group_kinds jsonb not null default '[]';

create table if not exists wa_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  jid text not null,
  name text,
  kind text,                       -- one of organizations.wa_group_kinds, or null = not tracked
  participants_synced_at timestamptz,
  participants_error text,
  created_at timestamptz not null default now(),
  unique (org_id, jid)
);
alter table wa_groups enable row level security;
create policy "members read wa_groups" on wa_groups for select using (org_id in (select my_org_ids()));
create policy "members update wa_groups" on wa_groups for update using (org_id in (select my_org_ids()));

create table if not exists wa_group_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references wa_groups(id) on delete cascade,
  phone_digits text,               -- normalised (972…); null for a manual link to a lead without a phone
  contact_id uuid references contacts(id) on delete cascade,
  source text not null default 'gateway' check (source in ('gateway', 'message', 'manual')),
  created_at timestamptz not null default now()
);
create unique index if not exists wa_group_members_phone_uq on wa_group_members (group_id, phone_digits) where phone_digits is not null;
create unique index if not exists wa_group_members_contact_uq on wa_group_members (group_id, contact_id) where contact_id is not null and phone_digits is null;
create index if not exists wa_group_members_phone_idx on wa_group_members (org_id, phone_digits);
create index if not exists wa_group_members_contact_idx on wa_group_members (contact_id);
alter table wa_group_members enable row level security;
create policy "members read wa_group_members" on wa_group_members for select using (org_id in (select my_org_ids()));
create policy "members add manual wa_group_members" on wa_group_members for insert with check (org_id in (select my_org_ids()) and source = 'manual');
create policy "members remove wa_group_members" on wa_group_members for delete using (org_id in (select my_org_ids()));
alter publication supabase_realtime add table wa_group_members;
alter publication supabase_realtime add table wa_groups;
