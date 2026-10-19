-- Files attached to a lead or a record (contracts, IDs, property photos…).
-- Kept in a private bucket under <org_id>/…; opened through short-lived links.
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;

create table files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  record_id uuid references records(id) on delete cascade,
  name text not null,
  path text not null,           -- object path in the "files" bucket
  size bigint,
  mime text,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  external_ref text,
  created_at timestamptz not null default now(),
  check (contact_id is not null or record_id is not null)
);
create index files_contact_idx on files (contact_id, created_at desc);
create index files_record_idx on files (record_id, created_at desc);
create unique index files_org_external_ref_key on files (org_id, external_ref);
alter table files enable row level security;
create policy "members read files" on files for select using (org_id in (select my_org_ids()));
create policy "members add files" on files for insert with check (org_id in (select my_org_ids()));
create policy "uploader or admin deletes files" on files for delete
  using (org_id in (select my_admin_org_ids()) or (org_id in (select my_org_ids()) and uploaded_by = auth.uid()));
-- Same visibility as the lead / record the file belongs to.
create policy "lead visibility" on files as restrictive for select
  using (org_id in (select my_all_leads_org_ids()) or contact_id is null or contact_id in (select id from contacts));
create policy "record visibility" on files as restrictive for select
  using (record_id is null or record_id in (select id from records));

create policy "members read org files" on storage.objects for select
  using (bucket_id = 'files' and (storage.foldername(name))[1]::uuid in (select my_org_ids()));
create policy "members upload org files" on storage.objects for insert
  with check (bucket_id = 'files' and (storage.foldername(name))[1]::uuid in (select my_org_ids()));
create policy "members delete org files" on storage.objects for delete
  using (bucket_id = 'files' and (storage.foldername(name))[1]::uuid in (select my_org_ids()));
