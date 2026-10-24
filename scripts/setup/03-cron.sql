-- Schedules the every-minute background job (automation waits, meeting
-- reminders, scheduled messages, push notifications, webhook retries, Google
-- Calendar sync). Without it, nothing time-based ever runs.
--
-- The job calls the app's /api/cron/automations route with the CRON_SECRET
-- env var as a bearer token. Vercel Hobby only allows daily crons, so the
-- scheduler lives in the database (pg_cron + pg_net, both available on every
-- Supabase project, including Free).
--
-- Run in the Supabase SQL editor AFTER the app is deployed and CRON_SECRET is
-- set on Vercel. Edit the two values below. The secret is stored in Supabase
-- Vault, never in this file or in cron.job's command text.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Store the app URL + secret in Vault (re-run with new values to rotate:
--    delete the old secrets first, from Dashboard → Vault or with
--    `delete from vault.secrets where name in ('crm_app_url','crm_cron_secret');`).
select vault.create_secret('https://YOUR-APP.vercel.app', 'crm_app_url');   -- <-- no trailing slash
select vault.create_secret('PASTE-THE-SAME-VALUE-AS-CRON_SECRET', 'crm_cron_secret');

-- 2) Every minute, POST to the route.
select cron.schedule(
  'crm-automations',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_app_url') || '/api/cron/automations',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Check it runs (status 200 = OK, 401 = CRON_SECRET mismatch):
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select id, status_code, content from net._http_response order by id desc limit 5;
-- Stop it:
--   select cron.unschedule('crm-automations');
