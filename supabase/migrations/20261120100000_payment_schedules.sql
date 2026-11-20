-- Payment-schedule board: a contract's payments per lead/deal, with reminders.
-- ADDITIVE ONLY. Reminders become tasks (N days before each due date) plus a bell
-- notification and an optional automation trigger ("payment_due").

-- Per-organisation: how many days before a due date to remind (default 7 and 1).
alter table organizations add column if not exists payment_reminder_days integer[] not null default '{7,1}';
alter table organizations add column if not exists payment_create_tasks boolean not null default true;

create table payment_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  file_id uuid references files(id) on delete set null,   -- the contract (stored in the lead's files)
  title text not null,
  summary text,                                            -- short summary of the contract (AI or manual)
  total_amount numeric,
  currency text not null default 'ILS',
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  ai_extracted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payment_schedules_org_idx on payment_schedules (org_id, created_at desc);
create index payment_schedules_contact_idx on payment_schedules (contact_id);

create table payment_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  schedule_id uuid not null references payment_schedules(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  description text not null,
  amount numeric,
  due_date date,
  condition_text text,                                     -- non-date due rule from the contract ("on delivery")
  paid boolean not null default false,
  paid_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index payment_items_schedule_idx on payment_items (schedule_id, position);
create index payment_items_org_due_idx on payment_items (org_id, due_date);

create table payment_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references payment_items(id) on delete cascade,
  days_before integer not null,
  remind_on date not null,
  task_id uuid references tasks(id) on delete set null,
  notified_at timestamptz,
  unique (item_id, days_before)
);
create index payment_reminders_due_idx on payment_reminders (remind_on) where notified_at is null;

alter table payment_schedules enable row level security;
alter table payment_items enable row level security;
alter table payment_reminders enable row level security;

create policy "members read payment schedules" on payment_schedules for select using (org_id in (select my_org_ids()));
create policy "members add payment schedules" on payment_schedules for insert with check (org_id in (select my_org_ids()));
create policy "members edit payment schedules" on payment_schedules for update using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));
create policy "admins delete payment schedules" on payment_schedules for delete using (org_id in (select my_admin_org_ids()) or created_by = auth.uid());
-- Same visibility as the lead the schedule belongs to.
create policy "lead visibility" on payment_schedules as restrictive for select
  using (org_id in (select my_all_leads_org_ids()) or contact_id in (select id from contacts));

create policy "members read payment items" on payment_items for select using (org_id in (select my_org_ids()));
create policy "members add payment items" on payment_items for insert with check (org_id in (select my_org_ids()));
create policy "members edit payment items" on payment_items for update using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));
create policy "members delete payment items" on payment_items for delete using (org_id in (select my_org_ids()));
create policy "lead visibility" on payment_items as restrictive for select
  using (org_id in (select my_all_leads_org_ids()) or contact_id in (select id from contacts));

create policy "members read payment reminders" on payment_reminders for select using (org_id in (select my_org_ids()));

-- Automation trigger: a payment reminder fired (trigger_value = days before, empty = any).
alter type automation_trigger_type add value if not exists 'payment_due';
-- Values an automation run can use in its texts ({{payment_description}} …).
alter table automation_runs add column if not exists vars jsonb;
