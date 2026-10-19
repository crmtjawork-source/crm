-- Atomic counters for document reading sessions (called by the server only).

-- A reader opened the link: one row per session; counts the view and moves
-- "sent" to "viewed". Returns whether this was a new session, the very first
-- view, and when it was last viewed before this one.
create or replace function document_open(p_doc uuid, p_session text, p_device text, p_ip text, p_ua text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d documents;
  inserted boolean;
begin
  select * into d from documents where id = p_doc for update;
  if not found then return null; end if;
  insert into document_views (org_id, document_id, session_id, device, ip, user_agent)
  values (d.org_id, d.id, p_session, p_device, p_ip, left(p_ua, 400))
  on conflict (document_id, session_id) do nothing;
  inserted := found;
  if inserted then
    update documents set
      view_count = view_count + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now(),
      status = case when status = 'sent' then 'viewed' else status end
    where id = d.id;
  end if;
  return jsonb_build_object('new_session', inserted, 'first', d.first_viewed_at is null and inserted, 'prev_last', d.last_viewed_at);
end;
$$;

-- Reading time since the last ping, overall and per section.
create or replace function document_ping(p_doc uuid, p_session text, p_seconds integer, p_sections jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secs integer := greatest(0, least(coalesce(p_seconds, 0), 120));
  k text;
  v jsonb;
  merged jsonb;
begin
  select sections into merged from document_views where document_id = p_doc and session_id = p_session for update;
  if not found then return; end if;
  for k, v in select * from jsonb_each(coalesce(p_sections, '{}')) loop
    merged := jsonb_set(merged, array[k], to_jsonb(coalesce((merged ->> k)::int, 0) + greatest(0, least((v #>> '{}')::int, 120))));
  end loop;
  update document_views set seconds = seconds + secs, sections = merged, last_seen_at = now()
  where document_id = p_doc and session_id = p_session;
  update documents set view_seconds = view_seconds + secs, last_viewed_at = now() where id = p_doc;
end;
$$;

revoke execute on function document_open(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function document_ping(uuid, text, integer, jsonb) from public, anon, authenticated;
