-- Lead intake: per-source field renaming, and the last request kept for
-- troubleshooting.
-- field_map renames incoming keys before they're read, e.g. a CRM that
-- posts {"pcfsystemfield104": "050…"} → {"pcfsystemfield104": "phone"}.
-- A target that isn't a standard key (name, phone, email, campaign, …)
-- becomes the custom-field label.
alter table lead_sources add column field_map jsonb not null default '{}';
alter table lead_sources add column last_payload jsonb;
alter table lead_sources add column last_error text;
