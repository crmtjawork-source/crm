-- Recorded conversations (Zoom / Drive link or an uploaded audio/video file) on a lead:
-- transcribed by a speech-to-text provider, summarised by an LLM. Additive only.
create table call_recordings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  title text,
  source text not null check (source in ('upload', 'zoom', 'drive', 'link')),
  source_url text,
  source_path text,                -- original file in the "files" bucket (kept), <org_id>/recordings/…
  chunk_paths text[] not null default '{}',   -- temp pieces sent to the STT provider (deleted when done)
  chunk_offsets integer[] not null default '{}', -- start second of each piece
  chunks_done integer not null default 0,
  job_ref text,                    -- async STT job id (e.g. Soniox) of the piece being transcribed
  lock_until timestamptz,          -- a worker holds the recording until then (no double processing)
  transcript_parts jsonb not null default '[]',  -- [{offset, text, segments?}]
  -- fetching → awaiting_chunks (browser must cut a big file) → transcribing → summarizing → done | failed
  status text not null default 'fetching' check (status in ('fetching', 'awaiting_chunks', 'transcribing', 'summarizing', 'done', 'failed')),
  error text,
  provider text,                   -- STT provider used
  duration_seconds integer,
  transcript text,
  -- {summary, decisions[], action_items[{task, owner}], client_message}
  summary jsonb,
  sent_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index call_recordings_contact_idx on call_recordings (contact_id, created_at desc);
create index call_recordings_active_idx on call_recordings (status) where status in ('fetching', 'transcribing', 'summarizing');
alter table call_recordings enable row level security;
create policy "members read recordings" on call_recordings for select using (org_id in (select my_org_ids()));
create policy "members delete own recordings" on call_recordings for delete
  using (org_id in (select my_admin_org_ids()) or (org_id in (select my_org_ids()) and created_by = auth.uid()));
-- Same visibility as the lead itself.
create policy "lead visibility" on call_recordings as restrictive for select
  using (org_id in (select my_all_leads_org_ids()) or contact_id in (select id from contacts));
-- Inserts/updates happen only on the server (service role) after it checks the user.

-- Per-organisation AI configuration (keys!). RLS on and NO policies: only the
-- service role (server) can read it; the settings page talks to an API route.
create table org_ai_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  stt_provider text,               -- openai | groq | custom | mock
  stt_base_url text,
  stt_model text,
  stt_api_key text,
  llm_api_key text,                -- Anthropic
  llm_model text,
  zoom_account_id text,
  zoom_client_id text,
  zoom_client_secret text,
  updated_at timestamptz not null default now()
);
alter table org_ai_settings enable row level security;
