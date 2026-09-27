-- Payment automations (phase 7). All run from the daily refresh (pg_cron +
-- every Payments load), except the weekly digest which has its own job.
--
--   * Escalating late reminders: besides the one on the day rent turns
--     late, the tenant gets another at 7 and at 15 days late, and the owner
--     gets a copy of each.
--   * "Heads up" to the owner when a tenant who had paid every month on time
--     (3+ months) is late for the first time.
--   * Lease-end notices to both sides at 60 and 30 days before the end.
--   * Payment confirmed: when Wompi confirms a payment the tenant is told
--     their receipt is ready (the owner already got "Payment received").
--   * Weekly digest for owners every Monday morning.

-- 1. Bookkeeping columns -------------------------------------------------------

alter table public.payment add column if not exists late7_reminded_at timestamptz;
alter table public.payment add column if not exists late15_reminded_at timestamptz;
alter table public.contract add column if not exists end_notice_60_at timestamptz;
alter table public.contract add column if not exists end_notice_30_at timestamptz;

-- Months already more than 7 / 15 days late before this existed: mark them
-- as reminded so the first run doesn't send a burst of catch-up notices.
update public.payment set late7_reminded_at = now()
where status = 'Late' and late7_reminded_at is null and payment_date <= public.sv_today() - 7;
update public.payment set late15_reminded_at = now()
where status = 'Late' and late15_reminded_at is null and payment_date <= public.sv_today() - 15;

-- 2. Daily reminders ------------------------------------------------------------

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
    v_title text;
    v_body text;
    v_prior_due integer;
    v_prior_on_time integer;
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
        v_title := case
                when v_days = 0 then 'Rent due today: '
                when v_days = 1 then 'Rent due tomorrow: '
                else 'Rent due in ' || v_days || ' days: '
            end || coalesce(r.property_name, 'your lease');
        v_body := 'Your rent of ' || v_amount || ' is due ' || to_char(r.payment_date, 'Mon DD, YYYY')
            || '. You can pay it from Payments.';

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (r.tenant_dui, r.owner_id, 'Payments', v_title, v_body, r.contract_id);
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'auto_reminder', v_title || '. ' || v_body);
        v_sent := v_sent + 1;
    end loop;

    -- Late (day 0): tell both sides, once per installment. If the tenant had
    -- paid every earlier month on time, flag it to the owner as unusual.
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
        v_body := 'Your rent of ' || v_amount || ' was due ' || to_char(r.payment_date, 'Mon DD, YYYY')
            || ' and has not been paid yet. Please pay it from Payments.';

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (r.tenant_dui, r.owner_id, 'Payments', 'Rent overdue: ' || coalesce(r.property_name, 'your lease'),
                v_body, r.contract_id);

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

        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'auto_reminder', 'Rent overdue. ' || v_body);
        v_sent := v_sent + 2;

        select count(*),
               count(*) filter (
                   where status = 'Paid'
                     and paid_at is not null
                     and (paid_at at time zone 'America/El_Salvador')::date <= payment_date
               )
        into v_prior_due, v_prior_on_time
        from payment
        where contract_id = r.contract_id
          and status <> 'Cancelled'
          and payment_date < r.payment_date;

        if v_prior_due >= 3 and v_prior_on_time = v_prior_due then
            insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
            values (
                r.owner_id,
                r.tenant_dui,
                'Payments',
                'Heads up from Rony: ' || coalesce(r.property_name, 'your property'),
                coalesce(nullif(r.tenant_name, ''), 'Your tenant') || ' had paid all ' || v_prior_due
                    || ' months on time, and this is their first late month. A friendly check-in may be all it takes.',
                r.contract_id
            );
            v_sent := v_sent + 1;
        end if;
    end loop;

    -- 7 days late: second reminder, with a copy to the owner.
    for r in
        update payment p
        set late7_reminded_at = now()
        from contract c
        join add_business b on b.property_id = c.property_id
        left join users t on t.dui = c.tenant_dui
        where c.contract_id = p.contract_id
          and p.status = 'Late'
          and p.late7_reminded_at is null
          and p.payment_date <= sv_today() - 7
        returning p.contract_id, p.payment_date, p.amount, c.tenant_dui, b.owner_id, b.property_name,
                  trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')) as tenant_name
    loop
        v_amount := '$' || to_char(r.amount, 'FM999,999,990.00');
        v_body := 'Your rent of ' || v_amount || ' due ' || to_char(r.payment_date, 'Mon DD, YYYY')
            || ' is now 7 days overdue. Please pay it from Payments as soon as possible.';

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (r.tenant_dui, r.owner_id, 'Payments', 'Rent 7 days overdue: ' || coalesce(r.property_name, 'your lease'),
                v_body, r.contract_id);
        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.owner_id, r.tenant_dui, 'Payments',
            'Still unpaid after 7 days: ' || coalesce(r.property_name, 'your property'),
            coalesce(nullif(r.tenant_name, ''), 'Your tenant') || ' still owes the ' || v_amount || ' rent due '
                || to_char(r.payment_date, 'Mon DD, YYYY') || '. We sent them a second reminder.',
            r.contract_id
        );
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'auto_reminder', '7 days overdue. ' || v_body);
        v_sent := v_sent + 2;
    end loop;

    -- 15 days late: third and last automatic reminder.
    for r in
        update payment p
        set late15_reminded_at = now()
        from contract c
        join add_business b on b.property_id = c.property_id
        left join users t on t.dui = c.tenant_dui
        where c.contract_id = p.contract_id
          and p.status = 'Late'
          and p.late15_reminded_at is null
          and p.payment_date <= sv_today() - 15
        returning p.contract_id, p.payment_date, p.amount, c.tenant_dui, b.owner_id, b.property_name,
                  trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')) as tenant_name
    loop
        v_amount := '$' || to_char(r.amount, 'FM999,999,990.00');
        v_body := 'Your rent of ' || v_amount || ' due ' || to_char(r.payment_date, 'Mon DD, YYYY')
            || ' is now 15 days overdue. Please pay it today from Payments, or contact your owner if there is a problem.';

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (r.tenant_dui, r.owner_id, 'Payments', 'Rent 15 days overdue: ' || coalesce(r.property_name, 'your lease'),
                v_body, r.contract_id);
        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.owner_id, r.tenant_dui, 'Payments',
            'Still unpaid after 15 days: ' || coalesce(r.property_name, 'your property'),
            coalesce(nullif(r.tenant_name, ''), 'Your tenant') || ' still owes the ' || v_amount || ' rent due '
                || to_char(r.payment_date, 'Mon DD, YYYY') || '. This was the last automatic reminder; you can send your own from Payments.',
            r.contract_id
        );
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'auto_reminder', '15 days overdue. ' || v_body);
        v_sent := v_sent + 2;
    end loop;

    -- Lease ending in 31-60 days: first notice to both sides.
    for r in
        update contract c
        set end_notice_60_at = now()
        from add_business b
        where b.property_id = c.property_id
          and c.status = 'Active'
          and c.end_notice_60_at is null
          and c.end_date - sv_today() between 31 and 60
        returning c.contract_id, c.end_date, c.tenant_dui, b.owner_id, b.property_name
    loop
        v_days := r.end_date - sv_today();
        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.tenant_dui, r.owner_id, 'Payments',
            'Lease ending in ' || v_days || ' days: ' || coalesce(r.property_name, 'your lease'),
            'Your lease ends on ' || to_char(r.end_date, 'Mon DD, YYYY')
                || '. If you''d like to stay, you can ask to renew from Payments.',
            r.contract_id
        );
        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.owner_id, r.tenant_dui, 'Payments',
            'Lease ending in ' || v_days || ' days: ' || coalesce(r.property_name, 'your property'),
            'This lease ends on ' || to_char(r.end_date, 'Mon DD, YYYY')
                || '. You can offer the tenant a renewal from Payments, or plan to re-list the space.',
            r.contract_id
        );
        v_sent := v_sent + 2;
    end loop;

    -- Lease ending in 30 days or less: final notice.
    for r in
        update contract c
        set end_notice_30_at = now(),
            end_notice_60_at = coalesce(c.end_notice_60_at, now())
        from add_business b
        where b.property_id = c.property_id
          and c.status = 'Active'
          and c.end_notice_30_at is null
          and c.end_date - sv_today() between 0 and 30
        returning c.contract_id, c.end_date, c.tenant_dui, b.owner_id, b.property_name
    loop
        v_days := r.end_date - sv_today();
        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.tenant_dui, r.owner_id, 'Payments',
            'Lease ending in ' || v_days || ' days: ' || coalesce(r.property_name, 'your lease'),
            'Your lease ends on ' || to_char(r.end_date, 'Mon DD, YYYY')
                || '. If you haven''t agreed on a renewal yet, now is the time to ask from Payments.',
            r.contract_id
        );
        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (
            r.owner_id, r.tenant_dui, 'Payments',
            'Lease ending in ' || v_days || ' days: ' || coalesce(r.property_name, 'your property'),
            'This lease ends on ' || to_char(r.end_date, 'Mon DD, YYYY')
                || '. Offer a renewal from Payments or get the listing ready to rent again.',
            r.contract_id
        );
        v_sent := v_sent + 2;
    end loop;

    return v_sent;
end;
$$;

revoke all on function public.send_rent_reminders() from public, anon, authenticated;

-- 3. Payment confirmed -> tenant receipt notice -------------------------------------

create or replace function public.claim_and_notify_payment(p_payment_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_contract_id bigint;
    v_amount numeric;
    v_paid_on date;
    v_due date;
begin
    -- Atomically claim the right to notify for this payment: only one caller can ever
    -- flip notified_at from null, regardless of how many times this function is invoked
    -- (retries, concurrent webhook deliveries, etc.) for the same payment_id.
    update payment
    set notified_at = now()
    where payment_id = p_payment_id
      and status = 'Paid'
      and notified_at is null
    returning contract_id, amount, coalesce(paid_at, now())::date, payment_date
    into v_contract_id, v_amount, v_paid_on, v_due;

    if not found then
        return false;
    end if;

    -- Same transaction as the claim above: if an insert fails, the whole
    -- transaction (claim included) rolls back, so notified_at stays null and a
    -- future call can retry.
    insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
    select
        b.owner_id,
        c.tenant_dui,
        'Payments',
        'Payment received: ' || coalesce(b.property_name, 'your property'),
        '$' || to_char(v_amount, 'FM999,999,990.00') || ' for ' || to_char(v_due, 'FMMonth YYYY')
            || ' rent was paid on ' || to_char(v_paid_on, 'Mon DD, YYYY') || '.',
        v_contract_id
    from contract c
    join add_business b on b.property_id = c.property_id
    where c.contract_id = v_contract_id;

    insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
    select
        c.tenant_dui,
        b.owner_id,
        'Payments',
        'Payment confirmed: ' || coalesce(b.property_name, 'your lease'),
        'We received your $' || to_char(v_amount, 'FM999,999,990.00') || ' payment for '
            || to_char(v_due, 'FMMonth YYYY') || ' rent. Your receipt NS-' || lpad(p_payment_id::text, 6, '0')
            || ' is ready in Payments.',
        v_contract_id
    from contract c
    join add_business b on b.property_id = c.property_id
    where c.contract_id = v_contract_id;

    return true;
end;
$$;

-- 4. Weekly digest for owners ------------------------------------------------------

create or replace function public.send_owner_weekly_digest()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    v_sent integer := 0;
    v_body text;
begin
    perform refresh_payment_statuses();

    for r in
        select
            b.owner_id,
            coalesce(sum(p.amount) filter (
                where p.status in ('Scheduled', 'Pending') and p.payment_date between sv_today() and sv_today() + 6
            ), 0) as due_week,
            count(distinct c.contract_id) filter (
                where p.status in ('Scheduled', 'Pending') and p.payment_date between sv_today() and sv_today() + 6
            ) as due_tenants,
            coalesce(sum(p.amount) filter (where p.status = 'Late'), 0) as late_total,
            count(distinct c.contract_id) filter (where p.status = 'Late') as late_tenants,
            coalesce(sum(p.amount) filter (
                where p.status = 'Paid' and p.paid_at >= now() - interval '7 days'
            ), 0) as collected_week
        from contract c
        join add_business b on b.property_id = c.property_id
        left join payment p on p.contract_id = c.contract_id and p.status <> 'Cancelled'
        where c.status = 'Active'
        group by b.owner_id
    loop
        v_body := 'This week: $' || to_char(r.due_week, 'FM999,999,990.00') || ' due from '
            || r.due_tenants || case when r.due_tenants = 1 then ' tenant' else ' tenants' end
            || '. Collected in the last 7 days: $' || to_char(r.collected_week, 'FM999,999,990.00') || '.';
        if r.late_tenants > 0 then
            v_body := v_body || ' Late: $' || to_char(r.late_total, 'FM999,999,990.00') || ' from '
                || r.late_tenants || case when r.late_tenants = 1 then ' tenant' else ' tenants' end || '.';
        else
            v_body := v_body || ' Nobody is late.';
        end if;

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (r.owner_id, null, 'Payments', 'Your week in rent', v_body, null);
        v_sent := v_sent + 1;
    end loop;

    return v_sent;
end;
$$;

revoke all on function public.send_owner_weekly_digest() from public, anon, authenticated;

-- 5. Renewal offers/requests open the Payments screen (where the renewal
--    buttons are) instead of Contracts.

create or replace function public.send_tenant_notice(
    p_contract_id bigint,
    p_kind text,
    p_message text,
    p_tone text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller_dui varchar;
    v_lease record;
    v_message text := btrim(coalesce(p_message, ''));
    v_event_id bigint;
begin
    select dui into v_caller_dui from users where id_supabase_auth = auth.uid();
    if v_caller_dui is null then
        raise exception 'Not signed in.' using errcode = '42501';
    end if;

    if p_kind not in ('reminder', 'renewal_offer') then
        raise exception 'Unknown notice type.' using errcode = '22023';
    end if;
    if p_tone is not null and p_tone not in ('friendly', 'firm') then
        raise exception 'Unknown tone.' using errcode = '22023';
    end if;
    if length(v_message) < 10 or length(v_message) > 1200 then
        raise exception 'The message must be between 10 and 1200 characters.' using errcode = '22023';
    end if;

    select c.contract_id, c.status, c.end_date, c.tenant_dui, b.owner_id, b.property_name
    into v_lease
    from contract c
    join add_business b on b.property_id = c.property_id
    where c.contract_id = p_contract_id;

    if not found or v_lease.owner_id is distinct from v_caller_dui then
        raise exception 'Lease not found.' using errcode = '42501';
    end if;
    if v_lease.status <> 'Active' or v_lease.tenant_dui is null then
        raise exception 'This lease is not active.' using errcode = '22023';
    end if;

    if p_kind = 'reminder' and not exists (
        select 1 from payment where contract_id = p_contract_id and status = 'Late'
    ) then
        raise exception 'Reminders can only be sent when rent is late.' using errcode = '22023';
    end if;

    if p_kind = 'renewal_offer' and (v_lease.end_date is null or v_lease.end_date - sv_today() > 60) then
        raise exception 'Renewal offers open 60 days before the lease ends.' using errcode = '22023';
    end if;

    if exists (
        select 1 from lease_events
        where contract_id = p_contract_id
          and kind = p_kind
          and created_at > now() - interval '24 hours'
    ) then
        raise exception 'You already sent this today. Try again tomorrow.' using errcode = '22023';
    end if;

    insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
    values (
        v_lease.tenant_dui,
        v_caller_dui,
        'Payments',
        case
            when p_kind = 'reminder' then 'Rent reminder from your owner: '
            else 'Renewal offer: '
        end || coalesce(v_lease.property_name, 'your lease'),
        v_message,
        p_contract_id
    );

    insert into lease_events (contract_id, kind, tone, message, created_by_dui)
    values (p_contract_id, p_kind, p_tone, v_message, v_caller_dui)
    returning event_id into v_event_id;

    return v_event_id;
end;
$$;

revoke all on function public.send_tenant_notice(bigint, text, text, text) from public, anon;
grant execute on function public.send_tenant_notice(bigint, text, text, text) to authenticated;

create or replace function public.send_renewal_request(p_contract_id bigint, p_message text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller_dui varchar;
    v_lease record;
    v_message text := btrim(coalesce(p_message, ''));
    v_event_id bigint;
begin
    select dui into v_caller_dui from users where id_supabase_auth = auth.uid();
    if v_caller_dui is null then
        raise exception 'Not signed in.' using errcode = '42501';
    end if;

    if length(v_message) < 10 or length(v_message) > 1200 then
        raise exception 'The message must be between 10 and 1200 characters.' using errcode = '22023';
    end if;

    select c.contract_id, c.status, c.end_date, c.tenant_dui, b.owner_id, b.property_name
    into v_lease
    from contract c
    join add_business b on b.property_id = c.property_id
    where c.contract_id = p_contract_id;

    if not found or v_lease.tenant_dui is distinct from v_caller_dui then
        raise exception 'Lease not found.' using errcode = '42501';
    end if;
    if v_lease.status <> 'Active' then
        raise exception 'This lease is not active.' using errcode = '22023';
    end if;
    if v_lease.end_date is null or v_lease.end_date - sv_today() > 60 or v_lease.end_date < sv_today() then
        raise exception 'Renewal requests open 60 days before the lease ends.' using errcode = '22023';
    end if;

    if exists (
        select 1 from lease_events
        where contract_id = p_contract_id
          and kind = 'renewal_request'
          and created_at > now() - interval '24 hours'
    ) then
        raise exception 'You already sent a renewal request today.' using errcode = '22023';
    end if;

    insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
    values (
        v_lease.owner_id,
        v_caller_dui,
        'Payments',
        'Renewal request: ' || coalesce(v_lease.property_name, 'your property'),
        v_message,
        p_contract_id
    );

    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'renewal_request', v_message, v_caller_dui)
    returning event_id into v_event_id;

    return v_event_id;
end;
$$;

revoke all on function public.send_renewal_request(bigint, text) from public, anon;
grant execute on function public.send_renewal_request(bigint, text) to authenticated;
