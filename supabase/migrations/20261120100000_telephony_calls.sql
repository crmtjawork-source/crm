-- Telephony from inside the CRM (provider-agnostic).
--  * calls: extended so a call can be logged by the agent (click-to-call via a
--    tel: link, later a softphone) or by a provider webhook, with an outcome,
--    notes and a recording.
--  * telephony_connections / telephony_credentials: per-org provider config.
--    Secrets live only in telephony_credentials (no policies = service role).
--  * call_event_log: idempotency for provider webhooks.
-- Additive only.

alter table calls
  add column if not exists outcome text,
  add column if not exists notes text,
  add column if not exists agent_user_id uuid references users (id) on delete set null,
  add column if not exists source text not null default 'import' check (source in ('import', 'manual', 'provider')),
  add column if not exists ended_at timestamptz,
  -- false while the agent still has to fill in the after-call form.
  add column if not exists after_call_done boolean not null default true,
  add column if not exists recording_duration_seconds integer,
  add column if not exists task_id uuid references tasks (id) on delete set null;

create index if not exists calls_agent_idx on calls (org_id, agent_user_id, started_at desc);

-- Agents log and finish their own calls; admins keep managing everything.
create policy "agents log own calls" on calls for insert
  with check (org_id in (select my_org_ids()) and agent_user_id = auth.uid() and source = 'manual');
create policy "agents update own calls" on calls for update
  using (org_id in (select my_org_ids()) and agent_user_id = auth.uid() and source = 'manual')
  with check (org_id in (select my_org_ids()) and agent_user_id = auth.uid() and source = 'manual');
-- An attempt the agent never made can be dropped, but a finished call stays.
create policy "agents drop unfinished own calls" on calls for delete
  using (org_id in (select my_org_ids()) and agent_user_id = auth.uid() and source = 'manual' and after_call_done = false);

-- One row per org and provider ('generic' = any system that can post our JSON).
create table telephony_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  provider text not null,
  label text,
  enabled boolean not null default true,
  -- Non-secret options, e.g. {"consentAnnouncement": true}.
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, provider)
);
alter table telephony_connections enable row level security;
create policy "members read telephony connections" on telephony_connections for select using (org_id in (select my_org_ids()));
create policy "admins manage telephony connections" on telephony_connections for all
  using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

create table telephony_credentials (
  connection_id uuid primary key references telephony_connections (id) on delete cascade,
  -- Goes in the webhook URL: identifies the connection.
  webhook_secret text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  -- Verifies the signature of every event the provider posts.
  signing_secret text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  -- Optional provider API key (click-to-call, recording download).
  api_key text,
  updated_at timestamptz not null default now()
);
alter table telephony_credentials enable row level security;
-- telephony_credentials: no policies on purpose (service role only).

create table call_event_log (
  org_id uuid not null references organizations (id) on delete cascade,
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (org_id, provider, event_id)
);
alter table call_event_log enable row level security;
-- call_event_log: no policies on purpose (service role only).
