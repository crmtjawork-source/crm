-- Google Drive: a folder per client, signed documents and scanned files are
-- saved into it. One connected Google account per business (like the company
-- calendar). Additive only.

-- Per-business settings. Tokens live in drive_credentials (server only).
create table drive_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  account_email text,
  -- Scopes Google actually granted (a user can untick one on the consent screen).
  scopes text,
  connected_by uuid references users(id) on delete set null,
  -- Folder under which every client folder is created (created by the CRM when empty).
  root_folder_id text,
  root_folder_name text not null default 'לקוחות CRM',
  root_folder_url text,
  -- Client folder name: {{name}}, {{phone}}, {{email}}.
  folder_template text not null default '{{name}}',
  -- Save the signed PDF into the client's folder as soon as a document is signed.
  auto_save_signed boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table drive_credentials (
  org_id uuid primary key references organizations(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz
);
alter table drive_settings enable row level security;
alter table drive_credentials enable row level security; -- no policies: server only
create policy "members read drive_settings" on drive_settings for select using (org_id in (select my_org_ids()));

-- The client's folder, written back onto the lead.
alter table contacts add column drive_folder_id text;
alter table contacts add column drive_folder_url text;
alter table contacts add column drive_folder_lock_at timestamptz;

-- Where a stored file / signed document ended up in Drive.
alter table files add column drive_file_id text;
alter table files add column drive_url text;
alter table files add column drive_synced_at timestamptz;
alter table documents add column drive_file_id text;
alter table documents add column drive_url text;

-- Work queue: one job per document / file, so a retry never duplicates anything.
create table drive_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('document', 'file')),
  document_id uuid references documents(id) on delete cascade,
  file_id uuid references files(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  error text,
  drive_file_id text,
  drive_file_url text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  check ((kind = 'document' and document_id is not null) or (kind = 'file' and file_id is not null))
);
create unique index drive_jobs_document_uq on drive_jobs (document_id) where kind = 'document';
create unique index drive_jobs_file_uq on drive_jobs (file_id) where kind = 'file';
create index drive_jobs_pending_idx on drive_jobs (next_attempt_at) where status = 'pending';
create index drive_jobs_org_idx on drive_jobs (org_id, created_at desc);
alter table drive_jobs enable row level security;
create policy "members read drive_jobs" on drive_jobs for select using (org_id in (select my_org_ids()));
