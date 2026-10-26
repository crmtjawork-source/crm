-- A fixed company signature that appears on every proposal / agreement; the
-- client only adds theirs. { image: png data URL, name, title }.
alter table organizations add column company_signature jsonb;
