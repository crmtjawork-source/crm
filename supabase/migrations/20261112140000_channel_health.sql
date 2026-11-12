-- Gateway watchdog: when a linked WhatsApp stopped being connected, and when
-- the team was last told (so one outage = one alert, plus a reminder every 6h).
alter table channels add column if not exists unhealthy_since timestamptz;
alter table channels add column if not exists disconnect_alerted_at timestamptz;
