-- Roles: what a team member sees. Owners and admins always see everything;
-- a member with no role keeps full access (nothing changes until a role is
-- assigned). Enforced here, in row-level security — not only in the UI.

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  -- all | own_unassigned | own | none
  leads_scope text not null default 'all' check (leads_scope in ('all', 'own_unassigned', 'own', 'none')),
  -- object_type_id → all | own | none (missing = all)
  object_access jsonb not null default '{}',
  -- screens shown in the menu (null = all)
  features text[],
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
alter table roles enable row level security;
create policy "members read roles" on roles for select using (org_id in (select my_org_ids()));
create policy "admins manage roles" on roles for all using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

alter table memberships add column role_id uuid references roles(id) on delete set null;

-- The signed-in member's lead scope in an org.
create or replace function my_leads_scope(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when m.role in ('owner', 'admin') or r.id is null then 'all' else r.leads_scope end
  from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.org_id = p_org
$$;

create or replace function my_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(email) from users where id = auth.uid()
$$;

create or replace function contact_visible(p_org uuid, p_owner text) returns boolean
language sql stable security definer set search_path = public as $$
  select case my_leads_scope(p_org)
    when 'all' then true
    when 'own_unassigned' then p_owner is null or lower(p_owner) = my_email()
    when 'own' then lower(coalesce(p_owner, '')) = my_email()
    else false
  end
$$;

-- An object type's access for the signed-in member: all | own | none.
create or replace function my_record_access(p_org uuid, p_type uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when m.role in ('owner', 'admin') or r.id is null then 'all'
              else coalesce(r.object_access ->> p_type::text, 'all') end
  from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.org_id = p_org
$$;

revoke execute on function my_leads_scope(uuid), contact_visible(uuid, text), my_record_access(uuid, uuid) from anon;

-- Leads.
drop policy "members select contacts" on contacts;
create policy "members select contacts" on contacts for select
  using (org_id in (select my_org_ids()) and contact_visible(org_id, owner_email));
drop policy "members update contacts" on contacts;
create policy "members update contacts" on contacts for update
  using (org_id in (select my_org_ids()) and contact_visible(org_id, owner_email));

-- Everything hanging off a lead follows the lead's visibility (the subquery
-- runs under the same row-level security). Restrictive = ANDed with the
-- existing org policies.
create policy "lead visibility" on opportunities as restrictive for select using (contact_id in (select id from contacts));
create policy "lead visibility" on activities as restrictive for select using (contact_id is null or contact_id in (select id from contacts));
create policy "lead visibility" on tasks as restrictive for select using (contact_id is null or contact_id in (select id from contacts));
create policy "lead visibility" on appointments as restrictive for select using (contact_id is null or contact_id in (select id from contacts));
create policy "lead visibility" on conversations as restrictive for select using (contact_id is null or contact_id in (select id from contacts));
create policy "lead visibility" on messages as restrictive for select using (conversation_id in (select id from conversations));
create policy "lead visibility" on documents as restrictive for select using (contact_id is null or contact_id in (select id from contacts));
create policy "lead visibility" on calls as restrictive for select using (contact_id is null or contact_id in (select id from contacts));

-- Custom-object records.
create policy "object access" on records as restrictive for all
  using (case my_record_access(org_id, object_type_id)
           when 'all' then true
           when 'own' then lower(coalesce(owner_email, '')) = my_email() or created_by = auth.uid()
           else false end)
  with check (my_record_access(org_id, object_type_id) <> 'none');

-- Performance: the checks above run per row. These set-returning helpers are
-- evaluated once per query (InitPlan), so policies use them instead.
create or replace function my_all_leads_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and (m.role in ('owner', 'admin') or r.id is null or r.leads_scope = 'all')
$$;
create or replace function my_unassigned_leads_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and (m.role in ('owner', 'admin') or r.id is null or r.leads_scope in ('all', 'own_unassigned'))
$$;
create or replace function my_own_leads_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and (m.role in ('owner', 'admin') or r.id is null or r.leads_scope <> 'none')
$$;
revoke execute on function my_all_leads_org_ids(), my_unassigned_leads_org_ids(), my_own_leads_org_ids() from anon;

drop policy "members select contacts" on contacts;
create policy "members select contacts" on contacts for select using (
  org_id in (select my_all_leads_org_ids())
  or (owner_email is null and org_id in (select my_unassigned_leads_org_ids()))
  or (lower(owner_email) = (select my_email()) and org_id in (select my_own_leads_org_ids()))
);
drop policy "members update contacts" on contacts;
create policy "members update contacts" on contacts for update using (
  org_id in (select my_all_leads_org_ids())
  or (owner_email is null and org_id in (select my_unassigned_leads_org_ids()))
  or (lower(owner_email) = (select my_email()) and org_id in (select my_own_leads_org_ids()))
);

-- Child tables: skip the lead lookup entirely for full-access members.
drop policy "lead visibility" on opportunities;
create policy "lead visibility" on opportunities as restrictive for select using (org_id in (select my_all_leads_org_ids()) or contact_id in (select id from contacts));
drop policy "lead visibility" on activities;
create policy "lead visibility" on activities as restrictive for select using (org_id in (select my_all_leads_org_ids()) or contact_id is null or contact_id in (select id from contacts));
drop policy "lead visibility" on tasks;
create policy "lead visibility" on tasks as restrictive for select using (org_id in (select my_all_leads_org_ids()) or contact_id is null or contact_id in (select id from contacts));
drop policy "lead visibility" on appointments;
create policy "lead visibility" on appointments as restrictive for select using (org_id in (select my_all_leads_org_ids()) or contact_id is null or contact_id in (select id from contacts));
drop policy "lead visibility" on conversations;
create policy "lead visibility" on conversations as restrictive for select using (org_id in (select my_all_leads_org_ids()) or contact_id in (select id from contacts));
drop policy "lead visibility" on messages;
create policy "lead visibility" on messages as restrictive for select using (org_id in (select my_all_leads_org_ids()) or conversation_id in (select id from conversations));
drop policy "lead visibility" on documents;
create policy "lead visibility" on documents as restrictive for select using (org_id in (select my_all_leads_org_ids()) or contact_id is null or contact_id in (select id from contacts));
drop policy "lead visibility" on calls;
create policy "lead visibility" on calls as restrictive for select using (org_id in (select my_all_leads_org_ids()) or contact_id in (select id from contacts));

-- A role given to an invited member carries over when they sign up.
alter table invitations add column role_id uuid references roles(id) on delete set null;
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

  insert into public.memberships (org_id, user_id, role, role_id)
  select i.org_id, new.id, i.role, i.role_id
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
