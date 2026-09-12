-- Every policy so far checked `org_id in (select org_id from memberships
-- where user_id = auth.uid())` inline. Since `memberships` itself carries
-- that exact same self-referencing policy, Postgres has to re-evaluate the
-- policy on `memberships` to answer the subquery, which re-triggers the
-- same subquery — infinite recursion (Postgres error 42P17), and it fires
-- the moment any real (non-service-role) client queries ANY of these
-- tables, not just memberships itself.
--
-- Fix: two SECURITY DEFINER functions that look up the caller's org
-- memberships bypassing RLS internally (they run with the function
-- owner's privileges, not the caller's), breaking the cycle. This is the
-- standard pattern for self-referential multi-tenant RLS. Every policy
-- that used to inline the memberships subquery now calls one of these
-- instead.

create or replace function my_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from memberships where user_id = auth.uid()
$$;

create or replace function my_admin_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from memberships where user_id = auth.uid() and role in ('owner', 'admin')
$$;

drop policy "members read their orgs" on organizations;
create policy "members read their orgs" on organizations for select
  using (id in (select my_org_ids()));

drop policy "members read memberships in their orgs" on memberships;
create policy "members read memberships in their orgs" on memberships for select
  using (org_id in (select my_org_ids()));

drop policy "admins manage memberships in their orgs" on memberships;
create policy "admins manage memberships in their orgs" on memberships for all
  using (org_id in (select my_admin_org_ids()));

drop policy "admins manage invitations in their orgs" on invitations;
create policy "admins manage invitations in their orgs" on invitations for all
  using (org_id in (select my_admin_org_ids()));

drop policy "members manage contact_field_defs" on contact_field_defs;
create policy "members manage contact_field_defs" on contact_field_defs for all
  using (org_id in (select my_org_ids()));

drop policy "members manage activities" on activities;
create policy "members manage activities" on activities for all
  using (org_id in (select my_org_ids()));

drop policy "members manage tasks" on tasks;
create policy "members manage tasks" on tasks for all
  using (org_id in (select my_org_ids()));

drop policy "members manage appointment_types" on appointment_types;
create policy "members manage appointment_types" on appointment_types for all
  using (org_id in (select my_org_ids()));

drop policy "members manage appointments" on appointments;
create policy "members manage appointments" on appointments for all
  using (org_id in (select my_org_ids()));

drop policy "members manage availability_rules" on availability_rules;
create policy "members manage availability_rules" on availability_rules for all
  using (org_id in (select my_org_ids()));

drop policy "members manage forms" on forms;
create policy "members manage forms" on forms for all
  using (org_id in (select my_org_ids()));

drop policy "members manage form_fields" on form_fields;
create policy "members manage form_fields" on form_fields for all
  using (form_id in (select id from forms where org_id in (select my_org_ids())));

drop policy "members manage automation_runs" on automation_runs;
create policy "members manage automation_runs" on automation_runs for all
  using (org_id in (select my_org_ids()));

drop policy "members manage notifications" on notifications;
create policy "members manage notifications" on notifications for all
  using (org_id in (select my_org_ids()));

drop policy "members manage pipelines" on pipelines;
create policy "members manage pipelines" on pipelines for all
  using (org_id in (select my_org_ids()));

drop policy "members select stages" on stages;
create policy "members select stages" on stages for select
  using (pipeline_id in (select id from pipelines where org_id in (select my_org_ids())));

drop policy "members insert stages" on stages;
create policy "members insert stages" on stages for insert
  with check (pipeline_id in (select id from pipelines where org_id in (select my_org_ids())));

drop policy "members update stages" on stages;
create policy "members update stages" on stages for update
  using (pipeline_id in (select id from pipelines where org_id in (select my_org_ids())));

drop policy "admins delete stages" on stages;
create policy "admins delete stages" on stages for delete
  using (pipeline_id in (select id from pipelines where org_id in (select my_admin_org_ids())));

drop policy "members select contacts" on contacts;
create policy "members select contacts" on contacts for select
  using (org_id in (select my_org_ids()));

drop policy "members insert contacts" on contacts;
create policy "members insert contacts" on contacts for insert
  with check (org_id in (select my_org_ids()));

drop policy "members update contacts" on contacts;
create policy "members update contacts" on contacts for update
  using (org_id in (select my_org_ids()));

drop policy "admins delete contacts" on contacts;
create policy "admins delete contacts" on contacts for delete
  using (org_id in (select my_admin_org_ids()));

drop policy "members select opportunities" on opportunities;
create policy "members select opportunities" on opportunities for select
  using (org_id in (select my_org_ids()));

drop policy "members insert opportunities" on opportunities;
create policy "members insert opportunities" on opportunities for insert
  with check (org_id in (select my_org_ids()));

drop policy "members update opportunities" on opportunities;
create policy "members update opportunities" on opportunities for update
  using (org_id in (select my_org_ids()));

drop policy "admins delete opportunities" on opportunities;
create policy "admins delete opportunities" on opportunities for delete
  using (org_id in (select my_admin_org_ids()));

drop policy "members select automations" on automations;
create policy "members select automations" on automations for select
  using (org_id in (select my_org_ids()));

drop policy "members insert automations" on automations;
create policy "members insert automations" on automations for insert
  with check (org_id in (select my_org_ids()));

drop policy "members update automations" on automations;
create policy "members update automations" on automations for update
  using (org_id in (select my_org_ids()));

drop policy "admins delete automations" on automations;
create policy "admins delete automations" on automations for delete
  using (org_id in (select my_admin_org_ids()));

drop policy "members manage automation_steps" on automation_steps;
create policy "members manage automation_steps" on automation_steps for all
  using (automation_id in (select id from automations where org_id in (select my_org_ids())));
