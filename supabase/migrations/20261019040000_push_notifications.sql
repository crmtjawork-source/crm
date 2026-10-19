-- Phone/desktop push notifications (Web Push).

-- Each browser/phone a user turned notifications on in.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
create policy "users read own push subscriptions" on push_subscriptions for select using (user_id = auth.uid());
create policy "users delete own push subscriptions" on push_subscriptions for delete using (user_id = auth.uid());

-- Who a notification is for, where tapping it leads, and whether it was
-- pushed. target_email null = the lead's owner plus the org's admins.
alter table notifications add column target_email text;
alter table notifications add column url text;
alter table notifications add column pushed_at timestamptz;
-- Existing notifications are history, not news.
update notifications set pushed_at = created_at;
create index notifications_unpushed_idx on notifications (created_at) where pushed_at is null;

-- A lead assigned to someone tells them.
create or replace function notify_lead_assigned() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_email is not null and new.owner_email is distinct from old.owner_email then
    insert into notifications (org_id, contact_id, text, target_email, url)
    values (new.org_id, new.id, 'שויך אליך ליד: ' || new.name, lower(new.owner_email), '/contacts/' || new.id);
  end if;
  return new;
end;
$$;
create trigger contacts_notify_assigned after update of owner_email on contacts
  for each row execute function notify_lead_assigned();

-- A lead writing on WhatsApp tells their owner (or the admins).
create or replace function notify_inbound_message() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  if new.direction <> 'inbound' then return new; end if;
  select k.id, k.name, k.owner_email into c
  from conversations v join contacts k on k.id = v.contact_id where v.id = new.conversation_id;
  if c.id is null then return new; end if;
  insert into notifications (org_id, contact_id, text, target_email, url)
  values (new.org_id, c.id, '💬 ' || c.name || ': ' || left(coalesce(new.body, ''), 80), lower(c.owner_email), '/inbox?contact=' || c.id);
  return new;
end;
$$;
create trigger messages_notify_inbound after insert on messages
  for each row execute function notify_inbound_message();
