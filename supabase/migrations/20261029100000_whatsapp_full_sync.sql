-- WhatsApp like WhatsApp Web: every chat of a linked number (1:1 chats with
-- people who aren't leads, groups, media), plus 30 days of history on linking.
-- A personal number's chats are private to its owner — managers don't see them
-- unless they own that number.

-- Chats don't need a lead.
alter table conversations alter column contact_id drop not null;
alter table conversations add column chat_name text;            -- name from WhatsApp (contact / group subject)
alter table conversations add column is_group boolean not null default false;
alter table conversations add column wa_jid text;               -- the WhatsApp chat id

-- Names WhatsApp tells us (contacts, chats, groups), kept per linked number so
-- a chat gets its name whichever event arrives first.
create table wa_chat_names (
  channel_id uuid not null references channels(id) on delete cascade,
  jid text not null,
  name text not null,
  updated_at timestamptz not null default now(),
  primary key (channel_id, jid)
);
alter table wa_chat_names enable row level security;

-- Messages: who wrote it in a group, and the media (kept in Storage, fetched
-- from WhatsApp the first time it's opened).
alter table messages add column sender_jid text;
alter table messages add column sender_name text;
alter table messages add column media_path text;
alter table messages add column media_mime text;
alter table messages add column media_name text;
alter table messages add column media_size bigint;
alter table messages add column media_failed boolean not null default false;

-- Private media bucket; the app serves it through short-lived signed URLs
-- after checking the person may read that message.
insert into storage.buckets (id, name, public, file_size_limit) values ('whatsapp-media', 'whatsapp-media', false, 62914560) on conflict (id) do nothing;

-- Which channels' chats the signed-in person may read: the business's shared
-- numbers, and personal numbers they own.
create or replace function my_visible_channel_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from channels c
  where c.org_id in (select my_org_ids())
    and (c.owner_membership_id is null or c.owner_membership_id in (select m.id from memberships m where m.user_id = auth.uid()))
$$;
revoke execute on function my_visible_channel_ids() from anon;

create policy "personal chats private" on conversations as restrictive for select
  using (channel_id in (select my_visible_channel_ids()));

-- Chats without a lead aren't hidden by the lead-visibility rule.
drop policy "lead visibility" on conversations;
create policy "lead visibility" on conversations as restrictive for select using (
  org_id in (select my_all_leads_org_ids()) or contact_id is null or contact_id in (select id from contacts)
);

create index if not exists conversations_channel_last_idx on conversations (channel_id, last_message_at desc);
create index if not exists messages_conversation_created_idx on messages (conversation_id, created_at);
