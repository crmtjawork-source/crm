-- When the lead last did something (arrived, left details again, wrote on
-- WhatsApp). The leads list sorts by it so returning leads surface on top.
alter table contacts add column last_activity_at timestamptz;
update contacts set last_activity_at = created_at;
alter table contacts alter column last_activity_at set default now();
alter table contacts alter column last_activity_at set not null;
create index contacts_org_last_activity_idx on contacts (org_id, last_activity_at desc);

-- An inbound WhatsApp message counts as activity.
create or replace function touch_contact_on_inbound() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    update contacts set last_activity_at = greatest(last_activity_at, new.created_at)
    where id = (select contact_id from conversations where id = new.conversation_id);
  end if;
  return new;
end;
$$;
create trigger messages_touch_contact after insert on messages
  for each row execute function touch_contact_on_inbound();
