-- Stage gates: requirements a deal must meet to move between pipeline stages.
--  * kind 'check' — a checklist item an agent marks done on the lead card.
--  * kind 'file'  — a document of a given type that must be uploaded to the lead.
--  * direction 'leave' — required before the deal moves OUT of stage_id
--      (target_stage_id = only for that destination; null = any forward move).
--    direction 'enter' — required before the deal moves INTO stage_id.
-- Enforced in the database (trigger) so drag & drop, tables, the lead card,
-- automations and imports all behave the same. Additive only.

create table stage_gates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  direction text not null default 'leave' check (direction in ('enter', 'leave')),
  target_stage_id uuid references stages(id) on delete cascade,
  kind text not null check (kind in ('check', 'file')),
  label text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index stage_gates_stage_idx on stage_gates (stage_id);
alter table stage_gates enable row level security;
create policy "members read stage_gates" on stage_gates for select using (org_id in (select my_org_ids()));
create policy "admins manage stage_gates" on stage_gates for all
  using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));

create table lead_gate_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  gate_id uuid not null references stage_gates(id) on delete cascade,
  done_by uuid default auth.uid() references auth.users(id) on delete set null,
  done_at timestamptz not null default now(),
  unique (contact_id, gate_id)
);
alter table lead_gate_checks enable row level security;
create policy "members read gate checks" on lead_gate_checks for select using (org_id in (select my_org_ids()));
create policy "members add gate checks" on lead_gate_checks for insert with check (org_id in (select my_org_ids()));
create policy "members remove gate checks" on lead_gate_checks for delete using (org_id in (select my_org_ids()));
create policy "lead visibility" on lead_gate_checks as restrictive for select
  using (org_id in (select my_all_leads_org_ids()) or contact_id in (select id from contacts));

-- A file uploaded to satisfy a 'file' gate points at it.
alter table files add column gate_id uuid references stage_gates(id) on delete set null;
create index files_gate_idx on files (contact_id, gate_id) where gate_id is not null;

-- What is still missing for moving an opportunity to p_to (jsonb array, empty = free to move).
create or replace function missing_stage_gates(p_opp uuid, p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_opp opportunities%rowtype;
  v_from_pos int;
  v_to_pos int;
  v_res jsonb;
begin
  select * into v_opp from opportunities where id = p_opp;
  if not found or v_opp.stage_id = p_to then return '[]'::jsonb; end if;
  if auth.uid() is not null and v_opp.org_id not in (select my_org_ids()) then return '[]'::jsonb; end if;
  select position into v_from_pos from stages where id = v_opp.stage_id;
  select position into v_to_pos from stages where id = p_to;

  select coalesce(jsonb_agg(jsonb_build_object('gate_id', g.id, 'label', g.label, 'kind', g.kind, 'direction', g.direction, 'stage_id', g.stage_id) order by g.position, g.created_at), '[]'::jsonb)
    into v_res
  from stage_gates g
  where g.org_id = v_opp.org_id
    and (
      (g.direction = 'leave' and g.stage_id = v_opp.stage_id
        and (g.target_stage_id = p_to or (g.target_stage_id is null and coalesce(v_to_pos, 0) > coalesce(v_from_pos, 0))))
      or (g.direction = 'enter' and g.stage_id = p_to)
    )
    and not (
      (g.kind = 'check' and exists (select 1 from lead_gate_checks c where c.gate_id = g.id and c.contact_id = v_opp.contact_id))
      or (g.kind = 'file' and exists (select 1 from files f where f.gate_id = g.id and f.contact_id = v_opp.contact_id))
    );
  return v_res;
end $$;
grant execute on function missing_stage_gates(uuid, uuid) to authenticated;

create or replace function enforce_stage_gates() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_missing jsonb;
begin
  if old.stage_id is not distinct from new.stage_id then return new; end if;
  v_missing := missing_stage_gates(new.id, new.stage_id);
  if jsonb_array_length(v_missing) > 0 then
    raise exception 'stage_gate:%', v_missing using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger opportunities_enforce_gates before update of stage_id on opportunities
  for each row execute function enforce_stage_gates();

-- Pilot configuration, matched to stages by name when they exist
-- (safe to re-run: skips rows already there; does nothing if the stages don't exist yet).
-- drafts → signing date set: appraisal + principle approval must be ticked.
insert into stage_gates (org_id, stage_id, direction, target_stage_id, kind, label, position)
select s.pipeline_org, s.id, 'leave', t.id, k.kind, k.label, k.pos
from (select st.id, st.name, p.org_id as pipeline_org from stages st join pipelines p on p.id = st.pipeline_id) s
join (select st.id, st.name, p.org_id from stages st join pipelines p on p.id = st.pipeline_id) t on t.org_id = s.pipeline_org and t.name like '%נקבע מועד חתימה%'
cross join (values ('check', 'שמאות', 0), ('check', 'אישור עקרוני', 1)) as k(kind, label, pos)
where s.name like '%טיוט%'
  and not exists (select 1 from stage_gates g where g.stage_id = s.id and g.label = k.label);
-- payment schedule → waiting for rental: IDs, meter photos, rental agreement.
insert into stage_gates (org_id, stage_id, direction, target_stage_id, kind, label, position)
select s.pipeline_org, s.id, 'leave', t.id, k.kind, k.label, k.pos
from (select st.id, st.name, p.org_id as pipeline_org from stages st join pipelines p on p.id = st.pipeline_id) s
join (select st.id, st.name, p.org_id from stages st join pipelines p on p.id = st.pipeline_id) t on t.org_id = s.pipeline_org and t.name like '%ממתין להשכרה%'
cross join (values ('file', 'תעודות זהות', 0), ('file', 'צילומי מונים', 1), ('file', 'הסכם שכירות', 2)) as k(kind, label, pos)
where s.name like '%לוח תשלומים%'
  and not exists (select 1 from stage_gates g where g.stage_id = s.id and g.label = k.label);
