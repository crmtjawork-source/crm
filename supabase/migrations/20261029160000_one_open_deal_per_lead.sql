-- A lead has at most one open deal per pipeline. Duplicate open deals (two
-- cards for one lead) are closed as "abandoned" — the one furthest along stays
-- open — and the rule is enforced by the database from now on.
update opportunities set status = 'abandoned', closed_at = now(), lost_reason = 'כפילות — עסקה כפולה שנסגרה אוטומטית'
where id in (
  select id from (
    select o.id, row_number() over (partition by o.contact_id, o.pipeline_id order by s.position desc, o.created_at asc) rn
    from opportunities o join stages s on s.id = o.stage_id
    where o.status = 'open'
  ) r where r.rn > 1
);
create unique index opportunities_one_open_per_lead on opportunities (contact_id, pipeline_id) where status = 'open';
