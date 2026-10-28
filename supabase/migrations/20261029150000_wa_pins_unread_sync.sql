-- Pinned chats (kept in the CRM — WhatsApp's own pins aren't sent to us) and a
-- way to mirror the phone's unread counters without undoing a chat the person
-- just read in the CRM.
alter table conversations add column pinned_at timestamptz;
alter table conversations add column read_locally_at timestamptz;

-- p_unread: [{ "thread": "<external_thread_id>", "n": <unread count> }, …] for every chat of the number.
create or replace function apply_wa_unread(p_channel uuid, p_unread jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_changed integer;
begin
  with u as (select e ->> 'thread' as thread, greatest((e ->> 'n')::int, case when (e ->> 'n')::int < 0 then 1 else 0 end) as n from jsonb_array_elements(p_unread) e)
  update conversations c set unread_count = u.n
  from u
  where c.channel_id = p_channel and c.external_thread_id = u.thread
    and c.unread_count is distinct from u.n
    -- a chat read in the CRM in the last couple of minutes: the phone hasn't caught up yet
    and (c.read_locally_at is null or c.read_locally_at < now() - interval '2 minutes');
  get diagnostics v_changed = row_count;
  return v_changed;
end $$;
revoke execute on function apply_wa_unread(uuid, jsonb) from anon, authenticated;
