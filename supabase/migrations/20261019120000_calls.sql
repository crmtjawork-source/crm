-- Phone calls on a lead / record: imported history or a future phone-system
-- integration (direction, outcome, agent, length, recording, transcript, summary).
create table calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  record_id uuid references records(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text,                 -- answered / no_answer / busy / cancelled / failed
  from_number text,
  to_number text,
  agent_email text,
  agent_name text,
  duration_seconds integer,
  wait_seconds integer,
  recording_url text,
  -- [{speaker, text, start}]
  transcript jsonb,
  summary text,
  started_at timestamptz not null,
  provider text,               -- e.g. voicenter
  external_ref text,
  created_at timestamptz not null default now()
);
create index calls_contact_idx on calls (contact_id, started_at desc);
create index calls_record_idx on calls (record_id, started_at desc);
create unique index calls_org_external_ref_key on calls (org_id, external_ref);
alter table calls enable row level security;
create policy "members read calls" on calls for select using (org_id in (select my_org_ids()));
create policy "admins manage calls" on calls for all using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));
