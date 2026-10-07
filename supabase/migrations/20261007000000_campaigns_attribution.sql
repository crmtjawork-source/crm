-- Marketing attribution for any business: where each lead came from
-- (platform, agency, campaign, raw UTM/click ids), what each campaign cost,
-- and inbound lead-intake URLs that agencies, Google lead forms, Zapier/Make,
-- landing pages or any other tool can post leads to.

-- 1) Campaigns. One row per campaign per platform. `platform` is free text
--    with well-known values (meta, google, tiktok, linkedin, taboola,
--    outbrain, website, organic, referral, email, sms, whatsapp, other) so a
--    new channel never needs a migration. `agency` = who runs it (null =
--    in-house). `external_id` = the platform's campaign id when known.
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  platform text not null default 'other',
  agency text,
  external_id text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index campaigns_org_platform_external_key on campaigns (org_id, platform, external_id) where external_id is not null;
create index campaigns_org_idx on campaigns (org_id);

-- 2) Lead attribution. campaign_id = the campaign that brought the lead
--    (first touch). attribution = raw tracking data as received:
--    utm_source/medium/campaign/content/term, gclid/fbclid/ttclid, ad/adset
--    names and ids, landing page, referrer.
alter table contacts add column campaign_id uuid references campaigns(id) on delete set null;
alter table contacts add column attribution jsonb not null default '{}';
create index contacts_org_campaign_idx on contacts (org_id, campaign_id);

-- 3) Spend. One row per campaign per day per source; a monthly figure
--    entered by hand is stored on the 1st of that month. Several sources
--    (manual, csv, meta_api, google_api) can coexist without clobbering
--    each other.
create table campaign_spend (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  day date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'ILS',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (campaign_id, day, source)
);
create index campaign_spend_org_day_idx on campaign_spend (org_id, day);

-- 4) Lead intake URLs: POST /api/public/leads/<token>. Defaults fill in
--    whatever the sender doesn't say (e.g. an agency's feed is always
--    platform=meta, agency=AIR).
create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  default_platform text,
  default_agency text,
  default_campaign_id uuid references campaigns(id) on delete set null,
  active boolean not null default true,
  last_received_at timestamptz,
  received_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index lead_sources_org_idx on lead_sources (org_id);

-- Finds or creates a campaign: by platform id when one is given, else by
-- name (case-insensitive) within the platform. Fills in a missing
-- external_id/agency on a name match rather than duplicating the row.
create or replace function resolve_campaign(
  p_org uuid, p_platform text, p_name text, p_external_id text default null, p_agency text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_platform text := coalesce(nullif(trim(lower(p_platform)), ''), 'other');
  v_name text := nullif(trim(p_name), '');
  v_ext text := nullif(trim(p_external_id), '');
begin
  if v_name is null and v_ext is null then
    return null;
  end if;
  if v_ext is not null then
    select id into v_id from campaigns where org_id = p_org and platform = v_platform and external_id = v_ext;
    if v_id is not null then return v_id; end if;
  end if;
  if v_name is not null then
    select id into v_id from campaigns
    where org_id = p_org and platform = v_platform and lower(name) = lower(v_name)
      and (v_ext is null or external_id is null)
    order by created_at limit 1;
    if v_id is not null then
      update campaigns set external_id = coalesce(external_id, v_ext), agency = coalesce(agency, nullif(trim(p_agency), ''))
      where id = v_id;
      return v_id;
    end if;
  end if;
  insert into campaigns (org_id, name, platform, agency, external_id)
  values (p_org, coalesce(v_name, v_ext), v_platform, nullif(trim(p_agency), ''), v_ext)
  returning id into v_id;
  return v_id;
end;
$$;

-- Merges duplicate campaigns (e.g. "Get Scale" and "Getscale.io"): leads
-- and spend move to the target, then the source is deleted. Runs with the
-- caller's rights, so RLS still decides who may do it.
create or replace function merge_campaigns(p_source uuid, p_target uuid) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_source = p_target then return; end if;
  if (select org_id from campaigns where id = p_source) is distinct from (select org_id from campaigns where id = p_target) then
    raise exception 'campaigns belong to different organizations';
  end if;
  update contacts set campaign_id = p_target where campaign_id = p_source;
  update lead_sources set default_campaign_id = p_target where default_campaign_id = p_source;
  insert into campaign_spend (org_id, campaign_id, day, amount, currency, source)
  select org_id, p_target, day, amount, currency, source from campaign_spend where campaign_id = p_source
  on conflict (campaign_id, day, source) do update set amount = campaign_spend.amount + excluded.amount;
  delete from campaigns where id = p_source;
end;
$$;

alter table campaigns enable row level security;
alter table campaign_spend enable row level security;
alter table lead_sources enable row level security;

create policy "members read campaigns" on campaigns for select
  using (org_id in (select my_org_ids()));
create policy "members insert campaigns" on campaigns for insert
  with check (org_id in (select my_org_ids()));
create policy "members update campaigns" on campaigns for update
  using (org_id in (select my_org_ids()));
create policy "admins delete campaigns" on campaigns for delete
  using (org_id in (select my_admin_org_ids()));

create policy "members read campaign_spend" on campaign_spend for select
  using (org_id in (select my_org_ids()));
create policy "admins manage campaign_spend" on campaign_spend for all
  using (org_id in (select my_admin_org_ids()))
  with check (org_id in (select my_admin_org_ids()));

create policy "members read lead_sources" on lead_sources for select
  using (org_id in (select my_org_ids()));
create policy "admins manage lead_sources" on lead_sources for all
  using (org_id in (select my_admin_org_ids()))
  with check (org_id in (select my_admin_org_ids()));

-- New campaigns show up live (created by lead forms / intake URLs).
alter publication supabase_realtime add table campaigns;
