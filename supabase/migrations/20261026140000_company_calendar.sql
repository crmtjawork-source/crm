-- A shared company Google Calendar: every meeting and call booked in the CRM
-- (any owner) is also put on one calendar the business connects once.
-- Personal calendars keep working; this is a second destination.

alter table calendar_connections add column kind text not null default 'personal' check (kind in ('personal', 'company'));
alter table calendar_connections drop constraint calendar_connections_org_id_user_id_provider_key;
create unique index calendar_connections_unique on calendar_connections (org_id, user_id, provider, kind);
-- One company calendar per business.
create unique index calendar_connections_one_company on calendar_connections (org_id) where kind = 'company';

alter table appointments add column company_google_event_id text;
alter table calendar_sync_jobs add column target text not null default 'owner' check (target in ('owner', 'company'));
alter table calendar_sync_jobs add column org_id uuid;

create or replace function queue_calendar_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.google_event_id is not null then
      insert into calendar_sync_jobs (appointment_id, op, owner_user_id, google_event_id, org_id)
      values (old.id, 'delete', old.owner_user_id, old.google_event_id, old.org_id);
    end if;
    if old.company_google_event_id is not null then
      insert into calendar_sync_jobs (appointment_id, op, google_event_id, target, org_id)
      values (old.id, 'delete', old.company_google_event_id, 'company', old.org_id);
    end if;
    return old;
  end if;
  -- Only meetings that haven't ended; the sync's own write-back of an event id
  -- is not a change worth syncing.
  if new.end_at < now() then return new; end if;
  if tg_op = 'UPDATE'
     and (new.google_event_id is distinct from old.google_event_id or new.company_google_event_id is distinct from old.company_google_event_id)
     and new.start_at = old.start_at and new.end_at = old.end_at and new.title = old.title
     and new.notes is not distinct from old.notes and new.owner_user_id is not distinct from old.owner_user_id then
    return new;
  end if;
  -- Moved to someone else: take it off the previous owner's calendar.
  if tg_op = 'UPDATE' and old.google_event_id is not null and new.owner_user_id is distinct from old.owner_user_id then
    insert into calendar_sync_jobs (appointment_id, op, owner_user_id, google_event_id, org_id)
    values (old.id, 'delete', old.owner_user_id, old.google_event_id, old.org_id);
  end if;
  insert into calendar_sync_jobs (appointment_id, op, owner_user_id, org_id) values (new.id, 'upsert', new.owner_user_id, new.org_id);
  if exists (select 1 from calendar_connections where org_id = new.org_id and kind = 'company') then
    insert into calendar_sync_jobs (appointment_id, op, target, org_id) values (new.id, 'upsert', 'company', new.org_id);
  end if;
  return new;
end;
$$;
