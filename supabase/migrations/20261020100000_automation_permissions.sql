-- Creating and editing automations: owners/admins, members without a custom
-- role, and roles that include the "automations" screen. Everyone may read
-- them (the lead screens show what will be sent).
create or replace function my_automation_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid()
    and (m.role in ('owner', 'admin') or r.id is null or r.features is null or 'automations' = any(r.features))
$$;
revoke execute on function my_automation_org_ids() from anon;

drop policy "members insert automations" on automations;
create policy "automation managers insert automations" on automations for insert with check (org_id in (select my_automation_org_ids()));
drop policy "members update automations" on automations;
create policy "automation managers update automations" on automations for update using (org_id in (select my_automation_org_ids()));

drop policy "members manage automation_steps" on automation_steps;
create policy "members read automation_steps" on automation_steps for select
  using (automation_id in (select id from automations where org_id in (select my_org_ids())));
create policy "automation managers write automation_steps" on automation_steps for all
  using (automation_id in (select id from automations where org_id in (select my_automation_org_ids())))
  with check (automation_id in (select id from automations where org_id in (select my_automation_org_ids())));
