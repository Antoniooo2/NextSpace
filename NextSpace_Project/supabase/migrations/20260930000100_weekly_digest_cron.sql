-- Owners' weekly rent digest, Mondays at 6:10 am El Salvador time (12:10 UTC).
select cron.unschedule('owner-weekly-digest')
where exists (select 1 from cron.job where jobname = 'owner-weekly-digest');

select cron.schedule(
    'owner-weekly-digest',
    '10 12 * * 1',
    $$select public.send_owner_weekly_digest()$$
);
