-- Sends scheduled texts: runs the dispatch function every minute.
-- Run this ONCE in the Supabase SQL editor after deploying the functions.
-- Replace the two placeholders first:
--   YOUR-PROJECT-REF   from Project Settings > General (the xxxx in https://xxxx.supabase.co)
--   YOUR-CRON-SECRET   the same CRON_SECRET you set in Edge Function secrets
-- Don't commit the filled-in version.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co/functions/v1/dispatch', 'fysa_dispatch_url');
select vault.create_secret('YOUR-CRON-SECRET', 'fysa_cron_secret');

select cron.schedule('fysa-dispatch', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'fysa_dispatch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fysa_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) where exists (select 1 from public.messages where status in ('scheduled', 'sending') and scheduled_at <= now());
$$);
