-- Owner Payments v2.
--
-- 1. Rent is only ever paid through Wompi inside the app, so the owner's
--    manual "record payment" is removed, and the months marked paid while
--    testing it are put back to unpaid.
-- 2. lease_events: a per-lease activity log (manual reminders, automatic
--    reminders, renewal offers) that both sides of the lease can read. The
--    notifications table is recipient-only, so the owner could never see
--    what had already been sent.
-- 3. send_tenant_notice: the only way an owner sends a reminder or renewal
--    offer, checked server-side (their lease, the right situation, and not
--    more than once a day per kind).

-- 1. Remove manual payments ---------------------------------------------------

drop function if exists public.record_manual_payment(bigint, text, date);

-- The test payments all share the exact signature record_manual_payment
-- wrote: Cash, no Wompi transaction, paid_at at noon El Salvador time.
with reverted as (
    update public.payment p
    set status = public.installment_status_for(p.payment_date),
        payment_method = null,
        paid_at = null,
        notified_at = null
    where p.status = 'Paid'
      and p.payment_method = 'Cash'
      and p.wompi_transaction_id is null
      and extract(hour from p.paid_at at time zone 'America/El_Salvador') = 12
      and extract(minute from p.paid_at at time zone 'America/El_Salvador') = 0
    returning p.contract_id
)
delete from public.notifications n
where n.title like 'Payment recorded:%'
  and n.contract_id in (select contract_id from reverted);

-- Any leftover "Payment recorded" notices (from the same test) go too.
delete from public.notifications where title like 'Payment recorded:%';

-- 2. Lease activity log -------------------------------------------------------

create table if not exists public.lease_events (
    event_id bigint generated always as identity primary key,
    contract_id bigint not null references public.contract(contract_id) on delete cascade,
    kind text not null check (kind in ('reminder', 'auto_reminder', 'renewal_offer')),
    tone text check (tone in ('friendly', 'firm')),
    message text not null,
    created_by_dui varchar,
    created_at timestamptz not null default now()
);

create index if not exists lease_events_contract_idx on public.lease_events (contract_id, created_at desc);

alter table public.lease_events enable row level security;

drop policy if exists "Lease parties can read lease events" on public.lease_events;
create policy "Lease parties can read lease events"
    on public.lease_events
    for select
    to authenticated
    using (
        contract_id in (
            select c.contract_id
            from public.contract c
            join public.add_business b on b.property_id = c.property_id
            where c.tenant_dui = (select dui from public.users where id_supabase_auth = auth.uid())
               or b.owner_id = (select dui from public.users where id_supabase_auth = auth.uid())
        )
    );
-- No insert/update/delete policies: rows are only written by the
-- SECURITY DEFINER functions below.

-- 3. Owner -> tenant notices ----------------------------------------------------

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
        case when p_kind = 'reminder' then 'Payments' else 'Contracts' end,
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

-- 4. Automatic reminders are logged too ----------------------------------------

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
    end loop;

    return v_sent;
end;
$$;

revoke all on function public.send_rent_reminders() from public, anon, authenticated;
