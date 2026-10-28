-- A role can be allowed to delete leads (e.g. a duplicate that came in twice).
-- Owners and admins always can; a plain agent can't.
alter table roles add column can_delete_leads boolean not null default false;
update roles set can_delete_leads = true where name in ('מנהל מכירות', 'סוכן בכיר');

create or replace function my_can_lead_flag(p_org uuid, p_flag text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when m.role in ('owner', 'admin') then true
    when r.id is not null then (case p_flag when 'assign' then r.can_assign_leads when 'delete' then r.can_delete_leads else r.can_edit_campaign end)
    else m.role <> 'agent'
  end
  from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.org_id = p_org
$$;

-- Deleting leads: admins as before, plus members whose role allows it (and
-- who can see the lead — the select policy still applies).
create policy "permitted members delete contacts" on contacts for delete
  using (org_id in (select my_org_ids()) and coalesce(my_can_lead_flag(org_id, 'delete'), false));
