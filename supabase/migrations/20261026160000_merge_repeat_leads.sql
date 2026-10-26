-- Whether a lead who leaves details again is merged into their existing lead
-- (default) or opens a new one. Either way, the same submission arriving
-- through two integrations within a short window is merged.
alter table organizations add column merge_repeat_leads boolean not null default true;
