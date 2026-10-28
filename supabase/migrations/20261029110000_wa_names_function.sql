-- Applies names WhatsApp sent (contacts / chats / groups) in one call: remembers
-- them per linked number and renames the matching chats.
create or replace function apply_wa_names(p_channel uuid, p_names jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into wa_chat_names (channel_id, jid, name)
  select p_channel, e ->> 'jid', e ->> 'name' from jsonb_array_elements(p_names) e
  where coalesce(e ->> 'name', '') <> '' and coalesce(e ->> 'jid', '') <> ''
  on conflict (channel_id, jid) do update set name = excluded.name, updated_at = now();

  update conversations c set chat_name = n.name
  from wa_chat_names n
  where n.channel_id = c.channel_id and n.jid = c.wa_jid and c.channel_id = p_channel
    and c.chat_name is distinct from n.name
    and n.jid in (select e ->> 'jid' from jsonb_array_elements(p_names) e);
end $$;
revoke execute on function apply_wa_names(uuid, jsonb) from anon, authenticated;

-- Existing lead chats get their WhatsApp chat id.
update conversations set wa_jid = external_thread_id || '@s.whatsapp.net' where wa_jid is null and external_thread_id ~ '^[0-9]+$';
