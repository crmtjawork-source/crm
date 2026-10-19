-- A meeting type can name who gets the meetings leads book themselves
-- (e.g. intro calls always go to the sales manager). Used when the lead has
-- no owner of its own.
alter table appointment_types add column default_owner_email text;

create or replace function default_appointment_owner() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is null and new.contact_id is not null then
    select u.id into new.owner_user_id
    from contacts c join users u on lower(u.email) = lower(c.owner_email)
    where c.id = new.contact_id;
  end if;
  if new.owner_user_id is null and new.type_id is not null then
    select u.id into new.owner_user_id
    from appointment_types t join users u on lower(u.email) = lower(t.default_owner_email)
    where t.id = new.type_id;
  end if;
  return new;
end;
$$;
