-- Custom objects: each business defines its own record types (clients,
-- properties, projects, vehicles…) with typed fields, option lists, a stage
-- pipeline and relations — all from the app, no code.

create table object_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,            -- plural, shown in the menu ("לקוחות")
  singular text not null,        -- one record ("לקוח")
  icon text,                     -- an emoji
  position integer not null default 0,
  -- The field shown as the record's title, and the select field whose
  -- options are the record's stages (board view + stage bar). Field keys.
  title_field text,
  stage_field text,
  created_at timestamptz not null default now()
);
alter table object_types enable row level security;
create policy "members read object_types" on object_types for select using (org_id in (select my_org_ids()));
create policy "admins manage object_types" on object_types for all
  using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

create table object_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  object_type_id uuid not null references object_types(id) on delete cascade,
  key text not null,             -- stable id inside records.data
  label text not null,
  type text not null check (type in ('text', 'long_text', 'number', 'currency', 'date', 'datetime', 'select', 'multi_select',
    'checkbox', 'phone', 'email', 'url', 'relation', 'user', 'contact')),
  -- select / multi_select: [{value, label, color}]
  options jsonb not null default '[]',
  -- relation: the object type it points to
  relation_type_id uuid references object_types(id) on delete set null,
  section text,                  -- groups fields on the record page
  required boolean not null default false,
  show_in_list boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (object_type_id, key)
);
create index object_fields_type_idx on object_fields (object_type_id, position);
alter table object_fields enable row level security;
create policy "members read object_fields" on object_fields for select using (org_id in (select my_org_ids()));
create policy "admins manage object_fields" on object_fields for all
  using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

create table records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  object_type_id uuid not null references object_types(id) on delete cascade,
  title text not null default '',
  data jsonb not null default '{}',
  owner_email text,
  -- The lead this record belongs to / came from (e.g. a client converted from a lead).
  contact_id uuid references contacts(id) on delete set null,
  external_ref text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index records_type_idx on records (object_type_id, updated_at desc);
create index records_contact_idx on records (contact_id);
create index records_data_idx on records using gin (data);
create unique index records_org_external_ref_key on records (org_id, external_ref);
alter table records enable row level security;
create policy "members manage records" on records for all
  using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));

create or replace function touch_record() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger records_touch before update on records for each row execute function touch_record();

-- Notes, history and tasks attach to a record as well as to a lead.
alter table activities alter column contact_id drop not null;
alter table activities add column record_id uuid references records(id) on delete cascade;
alter table activities add constraint activities_target_check check (contact_id is not null or record_id is not null);
create index activities_record_idx on activities (record_id, created_at desc);
alter table tasks add column record_id uuid references records(id) on delete cascade;
create index tasks_record_idx on tasks (record_id);

alter publication supabase_realtime add table records;
