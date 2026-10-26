-- A pipeline stage can be tied to a table (e.g. "deal closed" → clients):
-- when a lead's deal enters that stage, a record is created in the table from
-- the lead's details and linked to it. The deal stays in the pipeline.
-- It's a trigger, so every way of entering the stage (drag, table, lead card,
-- automations, imports) behaves the same.

alter table stages add column link_object_type_id uuid references object_types(id) on delete set null;

create or replace function link_record_on_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type uuid;
  v_ot object_types%rowtype;
  v_contact contacts%rowtype;
  v_stage_name text;
  v_data jsonb := '{}';
  v_f record;
  v_first text;
  v_has_phone boolean := false;
  v_has_email boolean := false;
  v_has_contact boolean := false;
  v_has_user boolean := false;
begin
  select link_object_type_id, name into v_type, v_stage_name from stages where id = new.stage_id;
  if v_type is null then return new; end if;
  if tg_op = 'UPDATE' and old.stage_id = new.stage_id then return new; end if;
  -- One record per lead and table.
  if exists (select 1 from records where contact_id = new.contact_id and object_type_id = v_type) then return new; end if;
  select * into v_ot from object_types where id = v_type and org_id = new.org_id;
  if not found then return new; end if;
  select * into v_contact from contacts where id = new.contact_id;
  if not found then return new; end if;

  for v_f in select key, type from object_fields where object_type_id = v_type order by position loop
    if v_f.key = v_ot.title_field then
      v_data := v_data || jsonb_build_object(v_f.key, v_contact.name);
    elsif v_f.type = 'phone' and not v_has_phone and v_contact.phone is not null then
      v_data := v_data || jsonb_build_object(v_f.key, v_contact.phone); v_has_phone := true;
    elsif v_f.type = 'email' and not v_has_email and v_contact.email is not null then
      v_data := v_data || jsonb_build_object(v_f.key, v_contact.email); v_has_email := true;
    elsif v_f.type = 'contact' and not v_has_contact then
      v_data := v_data || jsonb_build_object(v_f.key, v_contact.id); v_has_contact := true;
    elsif v_f.type = 'user' and not v_has_user and v_contact.owner_email is not null then
      v_data := v_data || jsonb_build_object(v_f.key, v_contact.owner_email); v_has_user := true;
    end if;
  end loop;

  -- A new record starts at the table's first stage.
  if v_ot.stage_field is not null then
    select options -> 0 ->> 'value' into v_first from object_fields where object_type_id = v_type and key = v_ot.stage_field;
    if v_first is not null then v_data := v_data || jsonb_build_object(v_ot.stage_field, v_first); end if;
  end if;

  insert into records (org_id, object_type_id, title, data, owner_email, contact_id)
  values (new.org_id, v_type, v_contact.name, v_data, v_contact.owner_email, v_contact.id);
  insert into activities (org_id, contact_id, type, text)
  values (new.org_id, v_contact.id, 'note', '🔁 נוצר/ה ' || v_ot.singular || ' מהליד (שלב "' || v_stage_name || '")');
  return new;
end $$;

create trigger opportunities_link_record after insert or update of stage_id on opportunities
  for each row execute function link_record_on_stage();
