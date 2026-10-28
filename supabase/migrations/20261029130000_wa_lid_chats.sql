-- WhatsApp's anonymous chat ids ("@lid"): many chats are keyed by one instead
-- of a phone number. They're kept as their own chats; when WhatsApp later tells
-- us the phone behind one, the chat is merged into the phone-number chat.

create table wa_lid_map (
  channel_id uuid not null references channels(id) on delete cascade,
  lid text not null,          -- digits of the @lid id
  phone text not null,        -- digits of the phone number
  primary key (channel_id, lid)
);
alter table wa_lid_map enable row level security;

-- Moves one chat's messages into another and removes the emptied chat.
create or replace function merge_wa_conversations(p_from uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_from = p_to then return; end if;
  delete from messages m using messages k where m.conversation_id = p_from and k.conversation_id = p_to and k.external_id is not null and k.external_id = m.external_id;
  update messages set conversation_id = p_to where conversation_id = p_from;
  update conversations t set
    last_message_at = greatest(t.last_message_at, f.last_message_at),
    last_message_preview = case when f.last_message_at is not null and (t.last_message_at is null or f.last_message_at > t.last_message_at) then f.last_message_preview else t.last_message_preview end,
    unread_count = t.unread_count + f.unread_count,
    chat_name = coalesce(t.chat_name, f.chat_name)
  from conversations f where f.id = p_from and t.id = p_to;
  delete from conversations where id = p_from;
end $$;
revoke execute on function merge_wa_conversations(uuid, uuid) from anon, authenticated;
