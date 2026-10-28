-- A stage can ask "why wasn't the deal closed?" when a deal enters it; the
-- answer is picked from the business's own list of reasons and stored on the
-- deal (opportunities.lost_reason).

alter table stages add column asks_lost_reason boolean not null default false;
alter table organizations add column lost_reasons jsonb not null default '[]';
