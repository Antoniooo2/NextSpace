-- NextSpace's business model: a 5% fee on every monthly rent payment.
--
-- The tenant pays exactly the contract rent through Wompi, into NextSpace's
-- account. NextSpace keeps the fee and transfers the rest to the owner.
-- - The deposit carries no fee (it is returned at the end of the lease).
-- - Wompi's own processing fee is NextSpace's cost and never shows up here.
-- - The rate lives in platform_settings, is fixed on each contract when it
--   is offered, and is copied onto each payment when it is paid, so changing
--   the rate later never rewrites a signed lease or a past payment.

-- 1. The rate ---------------------------------------------------------------

create table if not exists public.platform_settings (
    id boolean primary key default true check (id),
    commission_rate numeric(5, 4) not null check (commission_rate >= 0 and commission_rate < 1),
    updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, commission_rate)
values (true, 0.05)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- The landing page shows the fee before anyone signs in.
drop policy if exists "Anyone can read the platform fee" on public.platform_settings;
create policy "Anyone can read the platform fee" on public.platform_settings
    for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.platform_settings from anon, authenticated;

create or replace function public.current_commission_rate()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select commission_rate from platform_settings where id
$$;

-- 2. Each lease keeps the rate it was offered with --------------------------

alter table public.contract
    add column if not exists commission_rate numeric(5, 4)
        check (commission_rate is null or (commission_rate >= 0 and commission_rate < 1));

create or replace function public.contract_commission_rate_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status in ('Offered', 'Active') and new.commission_rate is null then
        new.commission_rate := current_commission_rate();
    end if;
    return new;
end;
$$;

revoke execute on function public.contract_commission_rate_trigger() from public, anon, authenticated;

drop trigger if exists contract_commission_rate on public.contract;
create trigger contract_commission_rate
    before insert or update of status on public.contract
    for each row
    execute function public.contract_commission_rate_trigger();

-- Leases already offered or running take the current rate. (Every payment
-- so far is test data; see step 4.)
update public.contract c
set commission_rate = public.current_commission_rate()
where c.commission_rate is null
  and (
      c.status in ('Offered', 'Active')
      or exists (select 1 from public.payment p where p.contract_id = c.contract_id)
  );

-- 3. Transfers to owners ----------------------------------------------------

-- One row per transfer NextSpace makes to an owner. A transfer can cover
-- several rent payments; each covered payment points at it.
create table if not exists public.owner_payout (
    payout_id bigint generated always as identity primary key,
    owner_dui varchar not null references public.users (dui),
    gross_amount numeric(12, 2) not null check (gross_amount >= 0),
    commission_amount numeric(12, 2) not null check (commission_amount >= 0),
    net_amount numeric(12, 2) not null check (net_amount >= 0),
    payment_count integer not null check (payment_count > 0),
    method text not null default 'Bank transfer',
    reference text not null check (length(btrim(reference)) between 1 and 120),
    note text,
    sent_at timestamptz not null default now()
);

create index if not exists owner_payout_owner_idx on public.owner_payout (owner_dui, sent_at desc);

alter table public.owner_payout enable row level security;

drop policy if exists "Owners can read their transfers" on public.owner_payout;
create policy "Owners can read their transfers" on public.owner_payout
    for select to authenticated using (owner_dui = (select public.caller_dui()));

revoke insert, update, delete, truncate on public.owner_payout from anon, authenticated;
revoke all on public.owner_payout from anon;

-- 4. The fee on each payment ------------------------------------------------

alter table public.payment
    add column if not exists commission_rate numeric(5, 4),
    add column if not exists commission_amount numeric(12, 2),
    add column if not exists owner_amount numeric(12, 2),
    add column if not exists payout_id bigint references public.owner_payout (payout_id);

create index if not exists payment_payout_idx on public.payment (payout_id);

-- Filled in the moment a payment becomes Paid (the Wompi webhook), from the
-- lease's rate. Rounded to the cent; the owner's part is the rest, so the two
-- always add up to exactly what the tenant paid.
create or replace function public.payment_commission_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rate numeric;
begin
    if new.status = 'Paid'
        and (tg_op = 'INSERT' or old.status is distinct from 'Paid')
        and new.commission_rate is null
        and new.amount is not null then
        select coalesce(c.commission_rate, current_commission_rate())
        into v_rate
        from contract c
        where c.contract_id = new.contract_id;

        v_rate := coalesce(v_rate, current_commission_rate());
        new.commission_rate := v_rate;
        new.commission_amount := round(new.amount * v_rate, 2);
        new.owner_amount := new.amount - new.commission_amount;
    end if;
    return new;
end;
$$;

revoke execute on function public.payment_commission_trigger() from public, anon, authenticated;

drop trigger if exists payment_commission on public.payment;
create trigger payment_commission
    before insert or update of status on public.payment
    for each row
    execute function public.payment_commission_trigger();

-- Payments already made (test data) get the same breakdown and are waiting
-- for a transfer like any new one.
update public.payment p
set commission_rate = coalesce(c.commission_rate, public.current_commission_rate()),
    commission_amount = round(p.amount * coalesce(c.commission_rate, public.current_commission_rate()), 2),
    owner_amount = p.amount - round(p.amount * coalesce(c.commission_rate, public.current_commission_rate()), 2)
from public.contract c
where c.contract_id = p.contract_id
  and p.status = 'Paid'
  and p.commission_rate is null
  and p.amount is not null;

-- 5. Where owners get paid --------------------------------------------------

create table if not exists public.payout_account (
    owner_dui varchar primary key references public.users (dui) on delete cascade,
    holder_name text not null check (length(btrim(holder_name)) between 3 and 120),
    bank_name text not null check (length(btrim(bank_name)) between 2 and 80),
    account_type text not null check (account_type in ('Savings', 'Checking')),
    account_number text not null check (account_number ~ '^[0-9][0-9-]{4,28}[0-9]$'),
    updated_at timestamptz not null default now()
);

alter table public.payout_account enable row level security;

-- Only the owner (and NextSpace's staff through the dashboard) ever sees it.
drop policy if exists "Owners read their payout account" on public.payout_account;
create policy "Owners read their payout account" on public.payout_account
    for select to authenticated using (owner_dui = (select public.caller_dui()));

drop policy if exists "Owners add their payout account" on public.payout_account;
create policy "Owners add their payout account" on public.payout_account
    for insert to authenticated with check (
        owner_dui = (select public.caller_dui())
        and (select account_type from public.users where id_supabase_auth = auth.uid()) = 'property-owner'
    );

drop policy if exists "Owners update their payout account" on public.payout_account;
create policy "Owners update their payout account" on public.payout_account
    for update to authenticated
    using (owner_dui = (select public.caller_dui()))
    with check (owner_dui = (select public.caller_dui()));

revoke all on public.payout_account from anon;
revoke delete, truncate on public.payout_account from authenticated;

create or replace function public.payout_account_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

revoke execute on function public.payout_account_touch() from public, anon, authenticated;

drop trigger if exists payout_account_touch on public.payout_account;
create trigger payout_account_touch
    before insert or update on public.payout_account
    for each row
    execute function public.payout_account_touch();

-- 6. Owners accept the fee before publishing --------------------------------

create table if not exists public.platform_fee_acceptance (
    owner_dui varchar primary key references public.users (dui) on delete cascade,
    commission_rate numeric(5, 4) not null,
    accepted_at timestamptz not null default now()
);

alter table public.platform_fee_acceptance enable row level security;

drop policy if exists "Owners read their fee acceptance" on public.platform_fee_acceptance;
create policy "Owners read their fee acceptance" on public.platform_fee_acceptance
    for select to authenticated using (owner_dui = (select public.caller_dui()));

revoke insert, update, delete, truncate on public.platform_fee_acceptance from anon, authenticated;
revoke all on public.platform_fee_acceptance from anon;

create or replace function public.accept_platform_fee()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    v_rate numeric := current_commission_rate();
begin
    if v_caller is null
        or (select account_type from users where dui = v_caller) is distinct from 'property-owner' then
        raise exception 'Only property owners accept the NextSpace fee.' using errcode = '42501';
    end if;

    insert into platform_fee_acceptance (owner_dui, commission_rate, accepted_at)
    values (v_caller, v_rate, now())
    on conflict (owner_dui) do update
        set commission_rate = excluded.commission_rate,
            accepted_at = excluded.accepted_at;

    return v_rate;
end;
$$;

revoke all on function public.accept_platform_fee() from public, anon;
grant execute on function public.accept_platform_fee() to authenticated;

drop policy if exists "Owners can insert own properties" on public.add_business;
create policy "Owners can insert own properties" on public.add_business
    for insert with check (
        (owner_id)::text = (select users.dui from users where users.id_supabase_auth = auth.uid())::text
        and (select users.account_type from users where users.id_supabase_auth = auth.uid()) = 'property-owner'
        and exists (
            select 1 from platform_fee_acceptance a
            where a.owner_dui = (select users.dui from users where users.id_supabase_auth = auth.uid())
        )
    );

-- 7. Recording a transfer (NextSpace staff, from the Supabase SQL editor) ---

-- What each owner is owed right now, with where to send it:
--   select * from public.owner_payouts_due;
create or replace view public.owner_payouts_due
with (security_invoker = true)
as
select
    b.owner_id as owner_dui,
    u.first_name || ' ' || u.last_name as owner_name,
    count(*) as payment_count,
    sum(p.amount) as gross_amount,
    sum(p.commission_amount) as commission_amount,
    sum(p.owner_amount) as net_amount,
    min(p.paid_at) as oldest_paid_at,
    a.holder_name,
    a.bank_name,
    a.account_type,
    a.account_number
from public.payment p
join public.contract c on c.contract_id = p.contract_id
join public.add_business b on b.property_id = c.property_id
join public.users u on u.dui = b.owner_id
left join public.payout_account a on a.owner_dui = b.owner_id
where p.status = 'Paid'
  and p.owner_amount is not null
  and p.payout_id is null
group by b.owner_id, u.first_name, u.last_name, a.holder_name, a.bank_name, a.account_type, a.account_number;

revoke all on public.owner_payouts_due from anon, authenticated;

-- After making the bank transfer:
--   select public.record_owner_payout('01234567-8', 'BA-000123');
-- covers every paid payment still waiting for that owner, or pass the
-- payment ids the transfer covers as a third argument.
create or replace function public.record_owner_payout(
    p_owner_dui varchar,
    p_reference text,
    p_payment_ids bigint[] default null,
    p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_payout_id bigint;
    v_gross numeric;
    v_fee numeric;
    v_net numeric;
    v_count integer;
    v_ids bigint[];
begin
    if length(btrim(coalesce(p_reference, ''))) = 0 then
        raise exception 'The transfer reference is required.' using errcode = '22023';
    end if;

    select array_agg(p.payment_id order by p.payment_id)
    into v_ids
    from payment p
    join contract c on c.contract_id = p.contract_id
    join add_business b on b.property_id = c.property_id
    where b.owner_id = p_owner_dui
      and p.status = 'Paid'
      and p.owner_amount is not null
      and p.payout_id is null
      and (p_payment_ids is null or p.payment_id = any (p_payment_ids));

    if v_ids is null then
        raise exception 'Nothing is waiting to be transferred to this owner.' using errcode = '22023';
    end if;
    if p_payment_ids is not null and cardinality(v_ids) <> cardinality(array(select distinct unnest(p_payment_ids))) then
        raise exception 'Some of those payments are not paid, not this owner''s, or already transferred.' using errcode = '22023';
    end if;

    -- Lock the rows so two staff members can't record the same money twice.
    perform 1 from payment where payment_id = any (v_ids) for update;

    select sum(amount), sum(commission_amount), sum(owner_amount), count(*)
    into v_gross, v_fee, v_net, v_count
    from payment
    where payment_id = any (v_ids) and payout_id is null;

    if v_count <> cardinality(v_ids) then
        raise exception 'Some of those payments were just transferred. Try again.' using errcode = '40001';
    end if;

    insert into owner_payout (owner_dui, gross_amount, commission_amount, net_amount, payment_count, reference, note)
    values (p_owner_dui, v_gross, v_fee, v_net, v_count, btrim(p_reference), nullif(btrim(coalesce(p_note, '')), ''))
    returning payout_id into v_payout_id;

    update payment set payout_id = v_payout_id where payment_id = any (v_ids);

    insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
    values (
        p_owner_dui,
        null,
        'Payments',
        'Transfer sent: $' || to_char(v_net, 'FM999,999,990.00'),
        'NextSpace sent you $' || to_char(v_net, 'FM999,999,990.00') || ' for ' || v_count
            || case when v_count = 1 then ' rent payment' else ' rent payments' end
            || ' ($' || to_char(v_gross, 'FM999,999,990.00') || ' collected minus $'
            || to_char(v_fee, 'FM999,999,990.00') || ' NextSpace fee). Reference: ' || btrim(p_reference) || '.',
        null
    );

    return v_payout_id;
end;
$$;

revoke all on function public.record_owner_payout(varchar, text, bigint[], text) from public, anon, authenticated;

-- 8. Notifications say what the owner actually receives ---------------------

create or replace function public.claim_and_notify_payment(p_payment_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_contract_id bigint;
    v_amount numeric;
    v_fee numeric;
    v_net numeric;
    v_rate numeric;
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
    returning contract_id, amount, commission_amount, owner_amount, commission_rate,
              coalesce(paid_at, now())::date, payment_date
    into v_contract_id, v_amount, v_fee, v_net, v_rate, v_paid_on, v_due;

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
            || ' rent was paid on ' || to_char(v_paid_on, 'Mon DD, YYYY') || '.'
            || case when v_net is not null then
                ' You receive $' || to_char(v_net, 'FM999,999,990.00') || ' after the '
                || trim(trailing '.' from trim(trailing '0' from to_char(v_rate * 100, 'FM990.99')))
                || '% NextSpace fee ($' || to_char(v_fee, 'FM999,999,990.00') || '); it goes out in your next transfer.'
            else '' end,
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
    v_waiting numeric;
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
            ), 0) as collected_week,
            coalesce(sum(coalesce(p.owner_amount, p.amount)) filter (
                where p.status = 'Paid' and p.paid_at >= now() - interval '7 days'
            ), 0) as net_week
        from contract c
        join add_business b on b.property_id = c.property_id
        left join payment p on p.contract_id = c.contract_id and p.status <> 'Cancelled'
        where c.status = 'Active'
        group by b.owner_id
    loop
        v_body := 'This week: $' || to_char(r.due_week, 'FM999,999,990.00') || ' due from '
            || r.due_tenants || case when r.due_tenants = 1 then ' tenant' else ' tenants' end
            || '. Collected in the last 7 days: $' || to_char(r.collected_week, 'FM999,999,990.00');
        if r.collected_week > 0 then
            v_body := v_body || ' ($' || to_char(r.net_week, 'FM999,999,990.00') || ' for you after the NextSpace fee)';
        end if;
        v_body := v_body || '.';
        if r.late_tenants > 0 then
            v_body := v_body || ' Late: $' || to_char(r.late_total, 'FM999,999,990.00') || ' from '
                || r.late_tenants || case when r.late_tenants = 1 then ' tenant' else ' tenants' end || '.';
        else
            v_body := v_body || ' Nobody is late.';
        end if;

        select coalesce(sum(p.owner_amount), 0)
        into v_waiting
        from payment p
        join contract c2 on c2.contract_id = p.contract_id
        join add_business b2 on b2.property_id = c2.property_id
        where b2.owner_id = r.owner_id
          and p.status = 'Paid'
          and p.payout_id is null
          and p.owner_amount is not null;

        if v_waiting > 0 then
            v_body := v_body || ' Waiting to be transferred to you: $' || to_char(v_waiting, 'FM999,999,990.00') || '.';
        end if;

        insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
        values (r.owner_id, null, 'Payments', 'Your week in rent', v_body, null);
        v_sent := v_sent + 1;
    end loop;

    return v_sent;
end;
$$;

revoke all on function public.send_owner_weekly_digest() from public, anon, authenticated;
