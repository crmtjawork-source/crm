-- 1) Opportunity outcome. The pipeline board shows open opportunities only;
--    won/lost/abandoned keep their history (and the lost reason) without
--    piling thousands of closed cards into board columns.
create type opportunity_status as enum ('open', 'won', 'lost', 'abandoned');
alter table opportunities add column status opportunity_status not null default 'open';
alter table opportunities add column lost_reason text;
alter table opportunities add column closed_at timestamptz;
create index opportunities_org_status_idx on opportunities (org_id, status);

-- 2) Lead owner, by email: lets leads be assigned to teammates who were
--    invited but have not signed up yet (members and invitations both carry
--    an email). Null = unassigned.
alter table contacts add column owner_email text;
create index contacts_org_owner_idx on contacts (org_id, lower(owner_email));

-- 3) Link to the record a row was imported from, e.g. 'fireberry:<guid>', so
--    re-running an import updates rows instead of duplicating them.
alter table contacts add column external_ref text;
alter table opportunities add column external_ref text;
alter table activities add column external_ref text;
alter table appointments add column external_ref text;
alter table tasks add column external_ref text;
create unique index contacts_org_external_ref_key on contacts (org_id, external_ref);
create unique index opportunities_org_external_ref_key on opportunities (org_id, external_ref);
create unique index activities_org_external_ref_key on activities (org_id, external_ref);
create unique index appointments_org_external_ref_key on appointments (org_id, external_ref);
create unique index tasks_org_external_ref_key on tasks (org_id, external_ref);

-- 4) Accepting an invitation: whoever signs up with an invited email joins
--    that org with the invited role, and the invitation is consumed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

  insert into public.memberships (org_id, user_id, role)
  select i.org_id, new.id, i.role
  from public.invitations i
  where lower(i.email) = lower(new.email)
  on conflict (org_id, user_id) do nothing;

  update public.users u
  set full_name = coalesce(u.full_name, (select i.name from public.invitations i where lower(i.email) = lower(new.email) limit 1))
  where u.id = new.id;

  delete from public.invitations where lower(email) = lower(new.email);
  return new;
end;
$$;
