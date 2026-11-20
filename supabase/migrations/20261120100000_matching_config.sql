-- Client-to-property matching: one per-org config document (formula, which
-- object types/fields play the "property" and "client" roles, which property
-- statuses are excluded from suggestions). Additive only.
alter table organizations add column if not exists matching_config jsonb;
-- organizations already has RLS; reads/writes go through existing policies and /api/org/settings.
