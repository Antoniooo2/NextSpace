-- Automatic rent reminders, sent as in-app notifications (process 'Payments'):
--   * to the tenant, once, when an unpaid installment is 3 days or less from
--     its due date ("Rent due in 3 days")
--   * to the tenant AND the owner, once, when an installment turns Late
-- Each installment is reminded at most once per kind; the *_reminded_at
-- columns record that, so re-running never sends duplicates.

alter table public.payment add column if not exists upcoming_reminded_at timestamptz;
alter table public.payment add column if not exists late_reminded_at timestamptz;

create or replace function public.send_rent_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    v_sent integer := 0;
    v_days integer;
    v_amount text;
begin
    -- Upcoming: due within 3 days, still unpaid, on an Active lease.
    for r in
        update payment p
        set upcoming_reminded_at = now()
        from contract c
        join add_business b on b.property_id = c.property_id
        where c.contract_id = p.contract_id
          and c.status = 'Active'
          and p.status in ('Scheduled', 'Pending')
          and p.upcoming_reminded_at is null
          and p.payment_date between sv_today() and sv_today() + 3
        returning p.contract_id, p.payment_date, p.amount, c.tenant_dui, b.owner_id, b.property_name
    loop
        v_days := r.payment_date - sv_today();
        v_amount := '$' || to_char(r.amount, 'FM999,999,990.00');

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.tenant_dui,
            r.owner_id,
            'Payments',
            case
                when v_days = 0 then 'Rent due today: '
                when v_days = 1 then 'Rent due tomorrow: '
                else 'Rent due in ' || v_days || ' days: '
            end || coalesce(r.property_name, 'your lease'),
            'Your rent of ' || v_amount || ' is due ' || to_char(r.payment_date, 'Mon DD, YYYY')
                || '. You can pay it from Payments.',
            r.contract_id
        );
        v_sent := v_sent + 1;
    end loop;

    -- Late: tell both sides, once per installment.
    for r in
        update payment p
        set late_reminded_at = now()
        from contract c
        join add_business b on b.property_id = c.property_id
        left join users t on t.dui = c.tenant_dui
        where c.contract_id = p.contract_id
          and p.status = 'Late'
          and p.late_reminded_at is null
        returning p.contract_id, p.payment_date, p.amount, c.tenant_dui, b.owner_id, b.property_name,
                  trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')) as tenant_name
    loop
        v_amount := '$' || to_char(r.amount, 'FM999,999,990.00');

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.tenant_dui,
            r.owner_id,
            'Payments',
            'Rent overdue: ' || coalesce(r.property_name, 'your lease'),
            'Your rent of ' || v_amount || ' was due ' || to_char(r.payment_date, 'Mon DD, YYYY')
                || ' and has not been paid yet. Please pay it from Payments.',
            r.contract_id
        );

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.owner_id,
            r.tenant_dui,
            'Payments',
            'Late rent: ' || coalesce(r.property_name, 'your property'),
            coalesce(nullif(r.tenant_name, ''), 'Your tenant') || ' has not paid the ' || v_amount
                || ' rent due ' || to_char(r.payment_date, 'Mon DD, YYYY') || '.',
            r.contract_id
        );
        v_sent := v_sent + 2;
    end loop;

    return v_sent;
end;
$$;

revoke all on function public.send_rent_reminders() from public, anon, authenticated;

-- Statuses are refreshed first, then reminders go out for whatever just
-- became due or late. Runs daily via pg_cron and whenever a Payments screen
-- loads (both idempotent).
create or replace function public.refresh_payment_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update payment p
    set status = installment_status_for(p.payment_date)
    from contract c
    where c.contract_id = p.contract_id
      and c.status = 'Active'
      and p.status in ('Scheduled', 'Pending')
      and installment_status_for(p.payment_date) <> p.status;

    perform send_rent_reminders();
end;
$$;

revoke all on function public.refresh_payment_statuses() from public, anon;
grant execute on function public.refresh_payment_statuses() to authenticated;

-- Months that were already more than 3 days late before reminders existed
-- (old test data): mark them as reminded instead of flooding everyone's
-- inbox on the first run. Anything more recent gets its reminder normally.
update public.payment set late_reminded_at = now()
where status = 'Late' and late_reminded_at is null
  and payment_date < public.sv_today() - 3;
