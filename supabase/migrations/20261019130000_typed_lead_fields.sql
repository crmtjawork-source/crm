-- Lead fields get a type (list with options, number, date…), an order and a
-- group on the lead card. Values stay text in contacts.fields (a list field
-- stores the option's label), so existing data keeps working.
alter table contact_field_defs add column type text not null default 'text'
  check (type in ('text', 'long_text', 'number', 'currency', 'date', 'datetime', 'select', 'multi_select', 'checkbox', 'phone', 'email', 'url', 'user'));
alter table contact_field_defs add column options jsonb not null default '[]';
alter table contact_field_defs add column position integer not null default 0;
alter table contact_field_defs add column section text;
alter table contact_field_defs add column show_in_list boolean not null default false;
