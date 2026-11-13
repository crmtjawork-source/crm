-- Who created a task (for "tasks I assigned" and so the creator still sees a
-- task they handed to someone else when their role limits tasks to their own).
alter table tasks add column created_by uuid default auth.uid();

drop policy "own tasks" on tasks;
create policy "own tasks" on tasks as restrictive for select
  using (org_id in (select my_all_tasks_org_ids()) or assignee = (select my_full_name()) or created_by = auth.uid());
