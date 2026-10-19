-- Documents: proposals and contracts a lead opens from a link, reads and
-- signs online (a built-in replacement for tools like Prospero / PandaDoc).
-- A template holds the business's text; each document sent to a lead is a
-- rendered snapshot of it, so later template edits never change what a lead
-- already got (or signed).

create table document_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  -- Cover: big title, the business's logo, a background image and color.
  title text not null default '',
  logo_url text,
  cover_image_url text,
  accent_color text not null default '#1e3a8a',
  -- [{id, title, subtitle, body}] — body is light markup (see lib/documents.ts).
  sections jsonb not null default '[]',
  -- Extra details the signer fills in besides the name: id_number, email, phone, address.
  signer_fields text[] not null default '{}',
  -- The link stops accepting signatures this many days after sending (null = never).
  expiry_days integer,
  -- Default deal value, for reports (editable per document).
  default_value numeric,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table document_templates enable row level security;
create policy "members read document_templates" on document_templates for select using (org_id in (select my_org_ids()));
create policy "admins manage document_templates" on document_templates for all
  using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  template_id uuid references document_templates(id) on delete set null,
  contact_id uuid references contacts(id) on delete cascade,
  -- The link's only credential.
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  title text not null,
  -- {title, prepared_for, date, logo_url, cover_image_url, accent_color, sender_name, sender_email}
  cover jsonb not null default '{}',
  sections jsonb not null default '[]',
  signer_fields text[] not null default '{}',
  value numeric,
  status text not null default 'sent' check (status in ('sent', 'viewed', 'signed', 'declined', 'void')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  view_seconds integer not null default 0,
  signed_at timestamptz,
  -- {name, image (data URL), fields {}, ip, user_agent, content_hash}
  signature jsonb,
  declined_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now()
);
create index documents_org_sent_idx on documents (org_id, sent_at desc);
create index documents_contact_idx on documents (contact_id);
alter table documents enable row level security;
create policy "members read documents" on documents for select using (org_id in (select my_org_ids()));
create policy "members create documents" on documents for insert with check (org_id in (select my_org_ids()));
create policy "members update documents" on documents for update using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));
create policy "admins delete documents" on documents for delete using (org_id in (select my_admin_org_ids()));

-- Signatures are written only by the server (the public signing route); a
-- member can't fake or change one from the browser.
create or replace function guard_document_signature() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.signature := null; new.signed_at := null; new.status := 'sent';
      new.view_count := 0; new.view_seconds := 0; new.first_viewed_at := null; new.last_viewed_at := null;
    else
      new.signature := old.signature; new.signed_at := old.signed_at;
      new.view_count := old.view_count; new.view_seconds := old.view_seconds;
      new.first_viewed_at := old.first_viewed_at; new.last_viewed_at := old.last_viewed_at;
      new.declined_at := old.declined_at; new.decline_reason := old.decline_reason;
      -- Members may only void a document; a signed one stays as signed.
      if new.status is distinct from old.status and not (new.status = 'void' and old.status <> 'signed') then
        new.status := old.status;
      end if;
      -- A signed document's content is frozen.
      if old.status = 'signed' then
        new.sections := old.sections; new.cover := old.cover; new.title := old.title;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger documents_guard before insert or update on documents
  for each row execute function guard_document_signature();

-- One row per reading session of a document link.
create table document_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  session_id text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seconds integer not null default 0,
  -- section id → seconds that section was on screen
  sections jsonb not null default '{}',
  device text,
  ip text,
  user_agent text,
  unique (document_id, session_id)
);
create index document_views_doc_idx on document_views (document_id, started_at desc);
alter table document_views enable row level security;
create policy "members read document_views" on document_views for select using (org_id in (select my_org_ids()));

alter type automation_trigger_type add value if not exists 'document_signed';
alter type automation_trigger_type add value if not exists 'document_viewed';

alter publication supabase_realtime add table documents;
