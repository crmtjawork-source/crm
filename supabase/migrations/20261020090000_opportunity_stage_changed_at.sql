-- When a deal last changed stage — the board shows the most recently moved
-- cards first.
alter table opportunities add column stage_changed_at timestamptz;
update opportunities set stage_changed_at = created_at;
alter table opportunities alter column stage_changed_at set default now();
alter table opportunities alter column stage_changed_at set not null;

create or replace function touch_opportunity_stage() returns trigger language plpgsql as $$
begin
  if new.stage_id is distinct from old.stage_id or new.status is distinct from old.status then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;
create trigger opportunities_stage_changed before update on opportunities
  for each row execute function touch_opportunity_stage();

-- The move that just happened (before this column existed) counts too.
update opportunities o set stage_changed_at = a.created_at
from (
  select contact_id, max(created_at) created_at from activities
  where type = 'stage_change' and created_at > now() - interval '2 days' group by contact_id
) a
where a.contact_id = o.contact_id and o.status = 'open';
