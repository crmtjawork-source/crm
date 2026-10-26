-- Two more things a role controls: assigning a lead's owner and changing a
-- lead's campaign. Owners and admins always can; a plain agent (no custom
-- role) can't. Enforced in the database, not only in the UI.

alter table roles
  add column can_assign_leads boolean not null default true,
  add column can_edit_campaign boolean not null default true;

-- The seeded sales-agent and operations roles can't reassign or re-attribute leads.
update roles set can_assign_leads = false, can_edit_campaign = false where name in ('סוכן מכירות', 'תפעול');

create or replace function my_can_lead_flag(p_org uuid, p_flag text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when m.role in ('owner', 'admin') then true
    when r.id is not null then (case p_flag when 'assign' then r.can_assign_leads else r.can_edit_campaign end)
    else m.role <> 'agent'
  end
  from memberships m left join roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.org_id = p_org
$$;
revoke execute on function my_can_lead_flag(uuid, text) from anon;

create or replace function contacts_guard_owner_campaign() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Server-side jobs (automations, webhooks) run without a signed-in user.
  if auth.uid() is null then return new; end if;
  if new.owner_email is distinct from old.owner_email and not coalesce(my_can_lead_flag(new.org_id, 'assign'), false) then
    raise exception 'אין לך הרשאה לשייך לידים';
  end if;
  if new.campaign_id is distinct from old.campaign_id and not coalesce(my_can_lead_flag(new.org_id, 'campaign'), false) then
    raise exception 'אין לך הרשאה לשנות קמפיין';
  end if;
  return new;
end $$;

create trigger contacts_guard_owner_campaign before update on contacts
  for each row execute function contacts_guard_owner_campaign();
