-- A colour per pipeline stage and per handling status, so boards and lists
-- read at a glance. Editable in the app.
alter table stages add column color text;
alter table lead_statuses add column color text;
