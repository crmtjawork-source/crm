-- Who wrote last in a chat — lets the list show chats waiting for an answer
-- (WhatsApp doesn't send unread counts for old messages).
alter table conversations add column last_direction text check (last_direction in ('inbound', 'outbound'));

create or replace function bump_conversation_inbound(conv_id uuid, at timestamptz, preview text)
returns void
language sql
as $$
  update conversations
  set unread_count = unread_count + 1,
      last_inbound_at = greatest(coalesce(last_inbound_at, at), at),
      last_message_at = greatest(coalesce(last_message_at, at), at),
      last_message_preview = case when last_message_at is null or at >= last_message_at then preview else last_message_preview end,
      last_direction = case when last_message_at is null or at >= last_message_at then 'inbound' else last_direction end
  where id = conv_id
$$;
revoke execute on function bump_conversation_inbound(uuid, timestamptz, text) from public, anon, authenticated;

update conversations c set last_direction = (select m.direction::text from messages m where m.conversation_id = c.id order by m.created_at desc limit 1)
where c.last_message_at is not null;

-- WhatsApp sometimes gives a bare number as a contact's "name": that's no name.
delete from wa_chat_names where name ~ '^[+0-9 ()-]+$';
update conversations set chat_name = null where chat_name ~ '^[+0-9 ()-]+$';
