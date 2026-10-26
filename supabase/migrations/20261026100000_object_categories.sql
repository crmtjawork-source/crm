-- Menu categories: a business groups its custom objects (tables) under named
-- categories (operations, sales, finance, marketing…); each category is a
-- collapsible group in the menu.

create table object_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  icon text,                     -- an emoji
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table object_categories enable row level security;
create policy "members read object_categories" on object_categories for select using (org_id in (select my_org_ids()));
create policy "admins manage object_categories" on object_categories for all
  using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

-- An object without a category stays loose in the menu; deleting a category
-- releases its objects instead of deleting them.
alter table object_types add column category_id uuid references object_categories(id) on delete set null;
