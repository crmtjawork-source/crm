-- Core tenant/access layer: organizations, users, memberships, invitations.
-- Every future table gets an org_id + RLS policy following this same
-- pattern (see packages/db/README.md).

create type member_role as enum ('owner', 'admin', 'agent');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Mirrors auth.users. Populated by the trigger below on signup.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role member_role not null default 'agent',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  role member_role not null default 'agent',
  invited_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

-- Auto-create a `users` row whenever someone signs up via Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS: every table below is scoped to the caller's org memberships.
-- This is the pattern every future table follows — never a table without
-- both an org_id column and a policy like the ones here.

alter table organizations enable row level security;
alter table users enable row level security;
alter table memberships enable row level security;
alter table invitations enable row level security;

create policy "members read their orgs"
  on organizations for select
  using (
    id in (select org_id from memberships where user_id = auth.uid())
  );

create policy "users read themselves and org-mates"
  on users for select
  using (
    id = auth.uid()
    or id in (
      select m2.user_id from memberships m1
      join memberships m2 on m2.org_id = m1.org_id
      where m1.user_id = auth.uid()
    )
  );

create policy "members read memberships in their orgs"
  on memberships for select
  using (
    org_id in (select org_id from memberships where user_id = auth.uid())
  );

create policy "admins manage memberships in their orgs"
  on memberships for all
  using (
    org_id in (
      select org_id from memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "admins manage invitations in their orgs"
  on invitations for all
  using (
    org_id in (
      select org_id from memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
