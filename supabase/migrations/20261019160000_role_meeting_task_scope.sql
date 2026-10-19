-- Roles can also limit meetings and tasks to the member's own.
alter table roles add column meetings_scope text not null default 'all' check (meetings_scope in ('all', 'own'));
alter table roles add column tasks_scope text not null default 'all' check (tasks_scope in ('all', 'own'));

create or replace function my_all_meetings_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and (m.role in ('owner', 'admin') or r.id is null or r.meetings_scope = 'all')
$$;
create or replace function my_all_tasks_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and (m.role in ('owner', 'admin') or r.id is null or r.tasks_scope = 'all')
$$;
create or replace function my_full_name() returns text
language sql stable security definer set search_path = public as $$
  select full_name from users where id = auth.uid()
$$;
revoke execute on function my_all_meetings_org_ids(), my_all_tasks_org_ids(), my_full_name() from anon;

create policy "own meetings" on appointments as restrictive for select
  using (org_id in (select my_all_meetings_org_ids()) or owner_user_id = auth.uid());
-- Tasks are assigned by name.
create policy "own tasks" on tasks as restrictive for select
  using (org_id in (select my_all_tasks_org_ids()) or assignee = (select my_full_name()));
