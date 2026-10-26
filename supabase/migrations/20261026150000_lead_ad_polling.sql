-- Lead Ads polling: Meta only delivers `leadgen` webhooks to published apps,
-- so connected Pages are also polled from the cron. `polled_until` is the
-- creation time up to which every lead of the Page was fetched.
alter table lead_ad_pages
  add column polled_until timestamptz,
  add column last_poll_at timestamptz,
  add column last_poll_error text;
