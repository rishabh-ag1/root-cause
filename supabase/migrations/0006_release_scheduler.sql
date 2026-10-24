-- New-case emails within a minute of a case going live.
-- Supabase's scheduler calls the app every minute; the endpoint sends at most once per case,
-- so it's a no-op except right after 09:00 IST (or after an admin schedules a case for today).
-- Vercel Cron (vercel.json) stays as a daily backup.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The bearer token must equal CRON_SECRET in Vercel. Store it in Vault once, e.g. from a shell:
--   select vault.create_secret('<CRON_SECRET>', 'rc_cron_secret', 'Bearer token for /api/cron/release');
-- (Done on 2026-10-24 via a temporary service-role-only RPC so the secret never appeared in SQL logs.)

select cron.unschedule('rootcause-release') where exists (select 1 from cron.job where jobname = 'rootcause-release');
select cron.schedule(
  'rootcause-release',
  '* * * * *',
  $job$
  select net.http_get(
    url := 'https://playrootcause.vercel.app/api/cron/release',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'rc_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- Keep the run log small.
select cron.unschedule('rootcause-cron-cleanup') where exists (select 1 from cron.job where jobname = 'rootcause-cron-cleanup');
select cron.schedule('rootcause-cron-cleanup', '15 21 * * *', $c$ delete from cron.job_run_details where end_time < now() - interval '3 days' $c$);
