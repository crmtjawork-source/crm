-- Mirror the phone's chat state like WhatsApp Web: pinned, archived, muted,
-- plus the chat's profile picture.
--   pinned_at   — now follows the phone (a pin made in the CRM still works until the phone says otherwise)
--   archived    — chats archived on the phone move to an "archived" view
--   muted_until — null = not muted; 'infinity' = muted forever
--   avatar_url  — contact / group picture (WhatsApp CDN link, refreshed lazily)
alter table conversations add column if not exists archived boolean not null default false;
alter table conversations add column if not exists muted_until timestamptz;
alter table conversations add column if not exists avatar_url text;
alter table conversations add column if not exists avatar_checked_at timestamptz;

-- p_flags: [{ "jid": "<chat jid>", "pinned": <ms|s epoch or null>, "archived": <bool>, "mute": <epoch or null or -1> }, …]
-- A key that is absent leaves that setting alone (WhatsApp sends partial updates).
create or replace function apply_wa_chat_flags(p_channel uuid, p_flags jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_changed integer := 0; v_n integer; e jsonb;
  v_pin timestamptz; v_mute timestamptz; v_num numeric;
begin
  for e in select * from jsonb_array_elements(p_flags) loop
    if coalesce(e ->> 'jid', '') = '' then continue; end if;

    if e ? 'pinned' then
      if jsonb_typeof(e -> 'pinned') = 'number' and (e ->> 'pinned')::numeric > 0 then
        v_num := (e ->> 'pinned')::numeric;
        v_pin := to_timestamp(case when v_num > 1e12 then v_num / 1000 else v_num end);
      else v_pin := null; end if;
      update conversations set pinned_at = v_pin
        where channel_id = p_channel and wa_jid = e ->> 'jid' and pinned_at is distinct from v_pin;
      get diagnostics v_n = row_count; v_changed := v_changed + v_n;
    end if;

    if e ? 'archived' and jsonb_typeof(e -> 'archived') = 'boolean' then
      update conversations set archived = (e ->> 'archived')::boolean
        where channel_id = p_channel and wa_jid = e ->> 'jid' and archived is distinct from (e ->> 'archived')::boolean;
      get diagnostics v_n = row_count; v_changed := v_changed + v_n;
    end if;

    if e ? 'mute' then
      if jsonb_typeof(e -> 'mute') = 'number' then
        v_num := (e ->> 'mute')::numeric;
        v_mute := case when v_num < 0 then 'infinity'::timestamptz
                       when v_num = 0 then null
                       else to_timestamp(case when v_num > 1e12 then v_num / 1000 else v_num end) end;
        if v_mute is not null and v_mute <> 'infinity' and v_mute < now() then v_mute := null; end if;
      else v_mute := null; end if;
      update conversations set muted_until = v_mute
        where channel_id = p_channel and wa_jid = e ->> 'jid' and muted_until is distinct from v_mute;
      get diagnostics v_n = row_count; v_changed := v_changed + v_n;
    end if;
  end loop;
  return v_changed;
end $$;
revoke execute on function apply_wa_chat_flags(uuid, jsonb) from anon, authenticated;
