-- A task handed to someone else tells them (bell + push). Done in the database so it
-- works from any screen or app version. Only for people acting in the app (auth.uid()
-- set): imports and server jobs that fill tasks in bulk stay silent.
create or replace function notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_me_name text; v_target_email text;
begin
  if v_me is null or coalesce(new.assignee, '') = '' then return new; end if;
  if tg_op = 'UPDATE' and new.assignee is not distinct from old.assignee then return new; end if;
  select u.email into v_target_email from memberships m join users u on u.id = m.user_id
    where m.org_id = new.org_id and u.full_name = new.assignee limit 1;
  if v_target_email is null then return new; end if;
  if exists (select 1 from users where id = v_me and lower(email) = lower(v_target_email)) then return new; end if;
  select full_name into v_me_name from users where id = v_me;
  insert into notifications (org_id, contact_id, text, target_email, url)
    values (new.org_id, new.contact_id, coalesce(v_me_name, 'מישהו') || ' שלח/ה לך משימה: ' || new.title, lower(v_target_email), '/tasks');
  return new;
end $$;

drop trigger if exists tasks_notify_assigned on tasks;
create trigger tasks_notify_assigned after insert or update of assignee on tasks
  for each row execute function notify_task_assigned();
