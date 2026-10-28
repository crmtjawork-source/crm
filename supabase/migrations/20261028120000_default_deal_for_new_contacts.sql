-- Every lead always has a stage: a new lead gets an open deal in the first
-- stage of the business's (first) pipeline, whatever created it (the form,
-- an import, an ad lead, an automation) and whether or not it has an owner.

create or replace function default_deal_for_new_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pipeline uuid;
  v_stage uuid;
begin
  if exists (select 1 from opportunities where contact_id = new.id) then return new; end if;
  select p.id into v_pipeline from pipelines p where p.org_id = new.org_id order by p.created_at limit 1;
  if v_pipeline is null then return new; end if;
  select s.id into v_stage from stages s where s.pipeline_id = v_pipeline order by s.position, s.created_at limit 1;
  if v_stage is null then return new; end if;
  insert into opportunities (org_id, contact_id, pipeline_id, stage_id, title, value) values (new.org_id, new.id, v_pipeline, v_stage, new.name, 0);
  return new;
end $$;

create trigger contacts_default_deal after insert on contacts
  for each row execute function default_deal_for_new_contact();

-- Leads that never had a deal start in the first stage too.
insert into opportunities (org_id, contact_id, pipeline_id, stage_id, title, value)
select c.org_id, c.id, p.id, s.id, c.name, 0
from contacts c
join lateral (select id from pipelines where org_id = c.org_id order by created_at limit 1) p on true
join lateral (select id from stages where pipeline_id = p.id order by position, created_at limit 1) s on true
where not exists (select 1 from opportunities o where o.contact_id = c.id);

-- New leads now arrive with a deal, so deal changes are pushed live like leads
-- (nobody has to refresh to see a new lead in the pipeline).
alter publication supabase_realtime add table opportunities;
