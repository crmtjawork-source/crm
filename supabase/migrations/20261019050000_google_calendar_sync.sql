-- One-way sync of meetings into each owner's Google Calendar.

-- A member's linked Google account. Tokens live in calendar_credentials,
-- readable by the server only.
create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null default 'google',
  account_email text,
  calendar_id text not null default 'primary',
  last_error text,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, provider)
);
create table calendar_credentials (
  connection_id uuid primary key references calendar_connections(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz
);
alter table calendar_connections enable row level security;
alter table calendar_credentials enable row level security;
create policy "members read calendar_connections" on calendar_connections for select
  using (org_id in (select my_org_ids()));
create policy "users delete own calendar_connections" on calendar_connections for delete
  using (user_id = auth.uid());

-- Whose meeting it is (whose calendar it goes to) and the Google event it maps to.
alter table appointments add column owner_user_id uuid references users(id) on delete set null default auth.uid();
alter table appointments add column google_event_id text;

-- Work queue: every change to a meeting becomes a job the cron job pushes.
create table calendar_sync_jobs (
  id bigserial primary key,
  appointment_id uuid,
  op text not null check (op in ('upsert', 'delete')),
  owner_user_id uuid,
  google_event_id text,
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index calendar_sync_jobs_pending_idx on calendar_sync_jobs (created_at) where done_at is null;
alter table calendar_sync_jobs enable row level security;

create or replace function queue_calendar_sync() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.google_event_id is not null then
      insert into calendar_sync_jobs (appointment_id, op, owner_user_id, google_event_id)
      values (old.id, 'delete', old.owner_user_id, old.google_event_id);
    end if;
    return old;
  end if;
  -- Only meetings that haven't ended; the sync's own write-back of
  -- google_event_id is not a change worth syncing.
  if new.end_at < now() then return new; end if;
  if tg_op = 'UPDATE' and new.google_event_id is distinct from old.google_event_id
     and new.start_at = old.start_at and new.end_at = old.end_at and new.title = old.title
     and new.notes is not distinct from old.notes and new.owner_user_id is not distinct from old.owner_user_id then
    return new;
  end if;
  -- Moved to someone else: take it off the previous owner's calendar.
  if tg_op = 'UPDATE' and old.google_event_id is not null and new.owner_user_id is distinct from old.owner_user_id then
    insert into calendar_sync_jobs (appointment_id, op, owner_user_id, google_event_id)
    values (old.id, 'delete', old.owner_user_id, old.google_event_id);
  end if;
  insert into calendar_sync_jobs (appointment_id, op, owner_user_id) values (new.id, 'upsert', new.owner_user_id);
  return new;
end;
$$;
create trigger appointments_calendar_sync
  after insert or update or delete on appointments
  for each row execute function queue_calendar_sync();

-- Meetings created by the server (a lead booking through their link,
-- imports) have no signed-in user: they belong to the lead's owner.
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
  return new;
end;
$$;
create trigger appointments_default_owner
  before insert on appointments
  for each row execute function default_appointment_owner();

update appointments a set owner_user_id = u.id
from contacts c join users u on lower(u.email) = lower(c.owner_email)
where a.contact_id = c.id and a.owner_user_id is null;
