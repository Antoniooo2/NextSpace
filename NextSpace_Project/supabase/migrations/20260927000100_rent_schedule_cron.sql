-- Daily status refresh at 00:05 El Salvador time (06:05 UTC), so installments
-- turn Pending/Late even on days nobody opens the Payments screen.
create extension if not exists pg_cron;

select cron.unschedule('refresh-payment-statuses')
where exists (select 1 from cron.job where jobname = 'refresh-payment-statuses');

select cron.schedule(
    'refresh-payment-statuses',
    '5 6 * * *',
    $$select public.refresh_payment_statuses()$$
);
