-- Messaging (WhatsApp Cloud API, incl. Coexistence), Meta Lead Ads intake,
-- and a durable server-side automation engine.
--
-- Security model for this migration:
--  * Tables holding third-party secrets (channel_credentials,
--    lead_ad_page_credentials) and raw webhook payloads (webhook_events) have
--    RLS enabled with NO policies — only the service role (server code) can
--    touch them. The browser never sees an access token.
--  * Everything org-scoped uses my_org_ids()/my_admin_org_ids() (see
--    20260912020000_fix_rls_recursion.sql) — never an inline memberships
--    subquery.

-- ============================ Phone normalization ============================
-- WhatsApp identifies people by wa_id (country code + number, digits only).
-- Leads typed by hand look like "050-123 4567". This generated column gives
-- every contact a comparable key. Israeli local format (leading 0) is mapped
-- to 972 because every tenant today is Israeli — make the default country a
-- per-org setting before onboarding a non-Israeli tenant.
-- The TypeScript twin is normalizePhone() in apps/web/src/lib/server/phone.ts;
-- the two must stay identical.

create function normalize_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    when regexp_replace(p, '\D', '', 'g') = '' then null
    when regexp_replace(p, '\D', '', 'g') ~ '^0\d{8,9}$'
      then '972' || substr(regexp_replace(p, '\D', '', 'g'), 2)
    else regexp_replace(p, '\D', '', 'g')
  end
$$;

alter table contacts add column phone_digits text generated always as (normalize_phone(phone)) stored;
create index contacts_org_phone_digits_idx on contacts (org_id, phone_digits);

-- ================================ Channels ================================

create type channel_provider as enum ('whatsapp_cloud');
create type message_direction as enum ('inbound', 'outbound');
create type message_status as enum ('pending', 'sent', 'delivered', 'read', 'failed', 'received');
-- Where an outbound message came from: typed in the CRM inbox, fired by an
-- automation, sent from the WhatsApp Business app on the phone (Coexistence
-- echo), or imported from the app's chat history on onboarding.
create type message_origin as enum ('crm', 'automation', 'phone_app', 'history');

create table channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  provider channel_provider not null,
  name text not null,
  -- WhatsApp: phone_number_id. Globally unique at Meta, which is what lets an
  -- incoming webhook be routed to the right tenant.
  external_id text not null,
  waba_id text,
  display_phone text,
  -- Set for an agent's personal line; null for the company's official number.
  owner_membership_id uuid references memberships (id) on delete set null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index channels_org_idx on channels (org_id);
create unique index channels_one_default_per_org on channels (org_id) where is_default;

create table channel_credentials (
  channel_id uuid primary key references channels (id) on delete cascade,
  access_token text not null,
  updated_at timestamptz not null default now()
);

-- ============================== Conversations ==============================

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  channel_id uuid not null references channels (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  -- The customer's wa_id on this channel.
  external_thread_id text not null,
  last_message_at timestamptz,
  last_message_preview text,
  -- Drives the 24h customer-service window: free-form text is only allowed
  -- within 24h of the customer's last message; outside it, templates only.
  last_inbound_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (channel_id, external_thread_id)
);
create index conversations_org_last_idx on conversations (org_id, last_message_at desc);
create index conversations_contact_idx on conversations (contact_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  direction message_direction not null,
  origin message_origin,
  type text not null default 'text',
  body text,
  payload jsonb not null default '{}',
  -- WhatsApp wamid. Unique per org so webhook redeliveries are idempotent
  -- (NULLs don't collide, so pending/failed rows without an id are fine).
  external_id text,
  status message_status not null,
  error text,
  sent_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, external_id)
);
create index messages_conversation_created_idx on messages (conversation_id, created_at);

-- Atomic bump for an inbound message (a read-modify-write from the webhook
-- handler would lose increments when two messages land at once).
create function bump_conversation_inbound(conv_id uuid, at timestamptz, preview text)
returns void
language sql
as $$
  update conversations
  set unread_count = unread_count + 1,
      last_inbound_at = greatest(coalesce(last_inbound_at, at), at),
      last_message_at = greatest(coalesce(last_message_at, at), at),
      last_message_preview = case when last_message_at is null or at >= last_message_at then preview else last_message_preview end
  where id = conv_id
$$;
revoke execute on function bump_conversation_inbound(uuid, timestamptz, text) from public, anon, authenticated;

-- ============================== Webhook inbox ==============================
-- Every webhook is persisted here BEFORE we answer 200 — Meta never
-- redelivers an acknowledged event, so acknowledging first and failing to
-- process would lose a lead for good. Processing happens afterwards and a
-- failed row is retried by the cron route.

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  attempts int not null default 0,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index webhook_events_retry_idx on webhook_events (status, received_at) where status <> 'processed';

-- ================================ Lead Ads ================================

create table lead_ad_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  page_id text not null unique,
  page_name text,
  created_at timestamptz not null default now()
);
create index lead_ad_pages_org_idx on lead_ad_pages (org_id);

create table lead_ad_page_credentials (
  lead_ad_page_id uuid primary key references lead_ad_pages (id) on delete cascade,
  page_access_token text not null,
  updated_at timestamptz not null default now()
);

create table lead_ad_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  leadgen_id text not null unique,
  page_id text not null,
  form_id text,
  ad_id text,
  contact_id uuid references contacts (id) on delete set null,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index lead_ad_submissions_org_idx on lead_ad_submissions (org_id);

-- ============================ Automation engine ============================
-- Runs now execute on the server. A `wait` step parks the run
-- (status = waiting, resume_at) and the cron route resumes it.

alter table automations add column stop_on_reply boolean not null default true;

alter table automation_steps add column channel_id uuid references channels (id) on delete set null;
alter table automation_steps add column template_name text;
alter table automation_steps add column template_language text;
alter table automation_steps add column template_params text[] not null default '{}';

alter table automation_runs add column status text not null default 'completed'
  check (status in ('running', 'waiting', 'completed', 'failed', 'cancelled'));
alter table automation_runs add column next_step_position int not null default 0;
alter table automation_runs add column resume_at timestamptz;
create index automation_runs_due_idx on automation_runs (resume_at) where status = 'waiting';
create index automation_runs_contact_waiting_idx on automation_runs (contact_id) where status = 'waiting';

-- Claims due runs atomically so two overlapping cron invocations never
-- execute the same step twice.
create function claim_due_automation_runs(max_runs int default 50)
returns setof uuid
language sql
as $$
  update automation_runs
  set status = 'running'
  where id in (
    select id from automation_runs
    where status = 'waiting' and resume_at <= now()
    order by resume_at
    limit max_runs
    for update skip locked
  )
  returning id
$$;
revoke execute on function claim_due_automation_runs(int) from public, anon, authenticated;

-- =================================== RLS ===================================

alter table channels enable row level security;
alter table channel_credentials enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table webhook_events enable row level security;
alter table lead_ad_pages enable row level security;
alter table lead_ad_page_credentials enable row level security;
alter table lead_ad_submissions enable row level security;
-- channel_credentials, lead_ad_page_credentials, webhook_events: no
-- policies on purpose (service role only).

create policy "members read channels" on channels for select
  using (org_id in (select my_org_ids()));
create policy "admins manage channels" on channels for all
  using (org_id in (select my_admin_org_ids()))
  with check (org_id in (select my_admin_org_ids()));

create policy "members read conversations" on conversations for select
  using (org_id in (select my_org_ids()));
create policy "members update conversations" on conversations for update
  using (org_id in (select my_org_ids()));

create policy "members read messages" on messages for select
  using (org_id in (select my_org_ids()));

create policy "members read lead_ad_pages" on lead_ad_pages for select
  using (org_id in (select my_org_ids()));
create policy "admins manage lead_ad_pages" on lead_ad_pages for all
  using (org_id in (select my_admin_org_ids()))
  with check (org_id in (select my_admin_org_ids()));

create policy "members read lead_ad_submissions" on lead_ad_submissions for select
  using (org_id in (select my_org_ids()));

-- ================================ Realtime ================================
-- Leads/notifications created by webhooks and conversations/messages must
-- show up in open browser tabs without a reload. Realtime respects RLS.

alter publication supabase_realtime add table contacts, notifications, activities, conversations, messages;
