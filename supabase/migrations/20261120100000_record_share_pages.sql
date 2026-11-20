-- Shareable client page per record (e.g. a property/deal): the record's chosen
-- fields + images + documents, behind an unguessable token. Public reads go
-- through the server (service role) with an allow-list — RLS here only lets
-- org members manage their own shares.

-- Gallery order + caption for files attached to a record.
alter table files add column if not exists position integer not null default 0;
alter table files add column if not exists caption text;

-- Org branding for shared pages: {logoUrl, accentColor, phone, contactName}.
alter table organizations add column if not exists share_brand jsonb;

create table record_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  published boolean not null default true,
  title text,                                   -- overrides the record title
  intro text,                                   -- short free text under the title
  field_keys text[] not null default '{}',      -- allow-list of object_fields.key
  file_ids uuid[] not null default '{}',        -- allow-list of files.id, in display order
  expires_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index record_shares_record_idx on record_shares (record_id, created_at desc);
alter table record_shares enable row level security;
create policy "members manage record_shares" on record_shares for all
  using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));
-- A member can only share a record they can see.
create policy "record visibility" on record_shares as restrictive for all
  using (record_id in (select id from records)) with check (record_id in (select id from records));

create or replace function touch_record_share() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger record_shares_touch before update on record_shares for each row execute function touch_record_share();
