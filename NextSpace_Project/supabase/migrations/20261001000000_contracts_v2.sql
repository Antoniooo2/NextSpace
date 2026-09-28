-- Contracts v2: a real lease lifecycle with terms and digital signatures.
--
--   Pending   the business requested the space (tenant insert, unchanged)
--   Offered   the owner answered with terms and signed; waiting for the tenant
--   Active    the tenant signed too (the rent schedule is generated here)
--   Declined  the owner declined, or the space went to another business
--   Withdrawn the business withdrew its request or turned the offer down
--   Expired   the lease reached its end date (also after an early termination)
--   Cancelled legacy / cancelled leases
--
-- Every transition goes through a SECURITY DEFINER function that checks who
-- is calling and whether the step is allowed; owners can no longer write
-- contract rows directly. Each step notifies the other side and is logged in
-- lease_events, which the contract page shows as its history.

-- 1. Schema -----------------------------------------------------------------------

alter table public.contract drop constraint if exists contract_status_check;
alter table public.contract add constraint contract_status_check
    check (status in ('Pending', 'Offered', 'Active', 'Declined', 'Withdrawn', 'Expired', 'Cancelled'));

alter table public.contract
    add column if not exists requested_at timestamptz,
    add column if not exists duration_months integer,
    add column if not exists deposit numeric,
    add column if not exists special_clauses text,
    add column if not exists offered_at timestamptz,
    add column if not exists offer_expires_at timestamptz,
    add column if not exists owner_signed_name text,
    add column if not exists owner_signed_at timestamptz,
    add column if not exists tenant_signed_name text,
    add column if not exists tenant_signed_at timestamptz,
    add column if not exists verification_code text,
    add column if not exists decline_reason text,
    add column if not exists closed_at timestamptz,
    add column if not exists end_reason text,
    add column if not exists termination_requested_by text,
    add column if not exists termination_date date,
    add column if not exists termination_reason text,
    add column if not exists termination_requested_at timestamptz;

alter table public.contract alter column requested_at set default now();

alter table public.contract drop constraint if exists contract_end_reason_check;
alter table public.contract add constraint contract_end_reason_check
    check (end_reason is null or end_reason in ('expired', 'terminated', 'cancelled'));
alter table public.contract drop constraint if exists contract_termination_by_check;
alter table public.contract add constraint contract_termination_by_check
    check (termination_requested_by is null or termination_requested_by in ('owner', 'tenant'));

-- One open request/offer per business per space.
create unique index if not exists contract_one_open_request
    on public.contract (property_id, tenant_dui)
    where status in ('Pending', 'Offered');

alter table public.lease_events drop constraint if exists lease_events_kind_check;
alter table public.lease_events add constraint lease_events_kind_check
    check (kind in (
        'reminder', 'auto_reminder', 'renewal_offer', 'renewal_request',
        'requested', 'invited', 'offered', 'signed', 'declined', 'auto_declined', 'withdrawn',
        'termination_requested', 'termination_accepted', 'termination_declined', 'expired'
    ));

-- 2. Existing data --------------------------------------------------------------------

-- Leases already running count as signed by both sides on their start date.
update public.contract c
set duration_months = greatest(1, (extract(year from age(c.end_date, c.start_date)) * 12
                                   + extract(month from age(c.end_date, c.start_date)))::int),
    owner_signed_name = coalesce(c.owner_signed_name, nullif(trim(o.first_name || ' ' || o.last_name), '')),
    owner_signed_at = coalesce(c.owner_signed_at, c.start_date::timestamptz),
    tenant_signed_name = coalesce(c.tenant_signed_name, nullif(trim(t.first_name || ' ' || t.last_name), '')),
    tenant_signed_at = coalesce(c.tenant_signed_at, c.start_date::timestamptz),
    verification_code = coalesce(c.verification_code,
        upper(substr(md5(c.contract_id || '|' || c.tenant_dui || '|' || c.start_date || '|' || c.end_date || '|' || c.monthly_rent), 1, 12)))
from public.add_business b
left join public.users o on o.dui = b.owner_id
, public.users t
where b.property_id = c.property_id
  and t.dui = c.tenant_dui
  and c.status = 'Active'
  and c.start_date is not null and c.end_date is not null;

-- Requests for a space that is already leased can never be accepted.
with stale as (
    update public.contract c
    set status = 'Declined',
        decline_reason = 'The space was already leased to another business.',
        closed_at = now()
    where c.status = 'Pending'
      and exists (
          select 1 from public.contract a
          where a.property_id = c.property_id and a.status = 'Active' and a.contract_id <> c.contract_id
      )
    returning c.contract_id
)
insert into public.lease_events (contract_id, kind, message)
select contract_id, 'auto_declined', 'Declined automatically: the space was already leased to another business.'
from stale;

-- 3. Owners change contracts only through the functions below ---------------------------

drop policy if exists "Owners can update their contracts" on public.contract;
drop policy if exists "Owners can create contracts on their properties" on public.contract;

-- 4. Helpers ----------------------------------------------------------------------------

create or replace function public.caller_dui()
returns varchar
language sql
stable
security definer
set search_path = public
as $$
    select dui from users where id_supabase_auth = auth.uid()
$$;

create or replace function public.contract_notify(
    p_recipient varchar, p_sender varchar, p_title text, p_body text, p_contract_id bigint
)
returns void
language sql
security definer
set search_path = public
as $$
    insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
    values (p_recipient, p_sender, 'Contracts', p_title, p_body, p_contract_id)
$$;

revoke all on function public.contract_notify(varchar, varchar, text, text, bigint) from public, anon, authenticated;

-- Log the tenant's request (the insert itself stays a plain RLS insert).
create or replace function public.contract_request_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'Pending' then
        insert into lease_events (contract_id, kind, message, created_by_dui)
        values (new.contract_id, 'requested', 'Lease requested at $' || to_char(new.monthly_rent, 'FM999,999,990.00') || '/month.', new.tenant_dui);
    end if;
    return null;
end;
$$;

drop trigger if exists contract_request_logged on public.contract;
create trigger contract_request_logged
    after insert on public.contract
    for each row execute function public.contract_request_logged();

-- 5. Owner: offer terms (answer a request, or update an open offer) -----------------------

create or replace function public.offer_contract(
    p_contract_id bigint,
    p_start date,
    p_months integer,
    p_rent numeric,
    p_deposit numeric,
    p_clauses text,
    p_owner_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_name text := btrim(coalesce(p_owner_name, ''));
    v_end date;
begin
    select k.*, b.owner_id, b.property_name, b.availability
    into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id
    for update of k;

    if not found or c.owner_id is distinct from v_caller then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    if c.status not in ('Pending', 'Offered') then
        raise exception 'Only open requests can receive an offer.' using errcode = '22023';
    end if;
    if exists (select 1 from contract a where a.property_id = c.property_id and a.status = 'Active') then
        raise exception 'This space already has an active lease.' using errcode = '22023';
    end if;
    if p_start is null or p_start < sv_today() then
        raise exception 'The start date cannot be in the past.' using errcode = '22023';
    end if;
    if p_months is null or p_months < 1 or p_months > 60 then
        raise exception 'The lease must be between 1 and 60 months.' using errcode = '22023';
    end if;
    if p_rent is null or p_rent <= 0 then
        raise exception 'The monthly rent must be greater than zero.' using errcode = '22023';
    end if;
    if p_deposit is not null and p_deposit < 0 then
        raise exception 'The deposit cannot be negative.' using errcode = '22023';
    end if;
    if length(coalesce(p_clauses, '')) > 3000 then
        raise exception 'Special clauses are limited to 3000 characters.' using errcode = '22023';
    end if;
    if length(v_name) < 3 then
        raise exception 'Type your full name to sign the offer.' using errcode = '22023';
    end if;

    v_end := (p_start + make_interval(months => p_months))::date;

    update contract
    set start_date = p_start,
        end_date = v_end,
        duration_months = p_months,
        monthly_rent = p_rent,
        deposit = p_deposit,
        special_clauses = nullif(btrim(coalesce(p_clauses, '')), ''),
        owner_signed_name = v_name,
        owner_signed_at = now(),
        offered_at = now(),
        offer_expires_at = now() + interval '7 days',
        status = 'Offered'
    where contract_id = p_contract_id;

    perform contract_notify(
        c.tenant_dui, v_caller,
        case when c.status = 'Offered' then 'Updated lease offer: ' else 'Lease offer: ' end || coalesce(c.property_name, 'a space'),
        'The owner offered $' || to_char(p_rent, 'FM999,999,990.00') || '/month for ' || p_months
            || case when p_months = 1 then ' month' else ' months' end
            || ' starting ' || to_char(p_start, 'Mon DD, YYYY')
            || '. Review and sign it in Contracts before ' || to_char((now() + interval '7 days') at time zone 'America/El_Salvador', 'Mon DD') || '.',
        p_contract_id
    );

    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'offered',
            'Offer: $' || to_char(p_rent, 'FM999,999,990.00') || '/month, ' || p_months || ' months from '
            || to_char(p_start, 'Mon DD, YYYY') || '. Signed by ' || v_name || '.', v_caller);
end;
$$;

-- 6. Owner: invite a business directly (by exact email or DUI) ------------------------------

create or replace function public.invite_tenant(
    p_property_id bigint,
    p_identifier text,
    p_start date,
    p_months integer,
    p_rent numeric,
    p_deposit numeric,
    p_clauses text,
    p_owner_name text
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_caller varchar := caller_dui();
    v_property record;
    v_identifier text := btrim(coalesce(p_identifier, ''));
    v_tenant record;
    v_contract_id bigint;
begin
    select * into v_property from add_business where property_id = p_property_id;
    if not found or v_property.owner_id is distinct from v_caller then
        raise exception 'Property not found.' using errcode = '42501';
    end if;
    if exists (select 1 from contract a where a.property_id = p_property_id and a.status = 'Active') then
        raise exception 'This space already has an active lease.' using errcode = '22023';
    end if;

    if position('@' in v_identifier) > 0 then
        select u.* into v_tenant
        from auth.users au join public.users u on u.id_supabase_auth = au.id
        where lower(au.email) = lower(v_identifier);
    else
        select * into v_tenant from public.users where dui = v_identifier;
    end if;

    if v_tenant.dui is null or v_tenant.account_type <> 'business' then
        raise exception 'No business account matches that email or DUI.' using errcode = '22023';
    end if;
    if v_tenant.dui = v_caller then
        raise exception 'You cannot invite yourself.' using errcode = '22023';
    end if;
    if exists (
        select 1 from contract where property_id = p_property_id and tenant_dui = v_tenant.dui and status in ('Pending', 'Offered')
    ) then
        raise exception 'This business already has an open request or offer for this space.' using errcode = '22023';
    end if;

    -- Starts as a Pending row, then goes through the same offer logic.
    insert into contract (business_id, property_id, tenant_dui, monthly_rent, status, requested_at)
    values (v_property.business_id, p_property_id, v_tenant.dui, coalesce(p_rent, v_property.monthly_rent, 1), 'Pending', now())
    returning contract_id into v_contract_id;

    delete from lease_events where contract_id = v_contract_id and kind = 'requested';
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (v_contract_id, 'invited', 'The owner invited ' || trim(v_tenant.first_name || ' ' || v_tenant.last_name) || ' to lease this space.', v_caller);

    perform offer_contract(v_contract_id, p_start, p_months, p_rent, p_deposit, p_clauses, p_owner_name);
    return v_contract_id;
end;
$$;

-- 7. Tenant: sign the offer ---------------------------------------------------------------------

create or replace function public.sign_contract(p_contract_id bigint, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_name text := btrim(coalesce(p_name, ''));
    v_code text;
    r record;
begin
    select k.*, b.owner_id, b.property_name
    into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id
    for update of k;

    if not found or c.tenant_dui is distinct from v_caller then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    if c.status <> 'Offered' then
        raise exception 'There is no offer to sign on this contract.' using errcode = '22023';
    end if;
    if c.offer_expires_at < now() then
        raise exception 'This offer expired. Ask the owner to send it again.' using errcode = '22023';
    end if;
    if c.start_date < sv_today() then
        raise exception 'The start date of this offer has passed. Ask the owner to update it.' using errcode = '22023';
    end if;
    if exists (select 1 from contract a where a.property_id = c.property_id and a.status = 'Active') then
        raise exception 'This space was already leased.' using errcode = '22023';
    end if;
    if length(v_name) < 3 then
        raise exception 'Type your full name to sign.' using errcode = '22023';
    end if;

    v_code := upper(substr(md5(c.contract_id || '|' || c.tenant_dui || '|' || c.owner_id || '|' || c.start_date
                              || '|' || c.end_date || '|' || c.monthly_rent || '|' || now()), 1, 12));

    -- Becoming Active fires contract_rent_schedule, which creates the months.
    update contract
    set tenant_signed_name = v_name,
        tenant_signed_at = now(),
        verification_code = v_code,
        status = 'Active'
    where contract_id = p_contract_id;

    update add_business set availability = 'Occupied' where property_id = c.property_id;

    perform contract_notify(
        c.owner_id, v_caller,
        'Lease signed: ' || coalesce(c.property_name, 'your property'),
        v_name || ' signed the lease. It starts ' || to_char(c.start_date, 'Mon DD, YYYY')
            || ' and the rent schedule is ready in Payments.',
        p_contract_id
    );
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'signed', 'Signed by ' || v_name || '. Verification code ' || v_code || '.', v_caller);

    -- Everyone else waiting on this space is told it's gone.
    for r in
        update contract k
        set status = 'Declined',
            decline_reason = 'The space was leased to another business.',
            closed_at = now()
        where k.property_id = c.property_id
          and k.contract_id <> p_contract_id
          and k.status in ('Pending', 'Offered')
        returning k.contract_id, k.tenant_dui
    loop
        perform contract_notify(
            r.tenant_dui, c.owner_id,
            'Request closed: ' || coalesce(c.property_name, 'a space'),
            'This space was leased to another business, so your request was closed. You can keep browsing the Marketplace.',
            r.contract_id
        );
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'auto_declined', 'Closed automatically: the space was leased to another business.');
    end loop;

    return v_code;
end;
$$;

-- 8. Decline (owner) / withdraw (tenant) -------------------------------------------------------------

create or replace function public.decline_contract(p_contract_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found or c.owner_id is distinct from v_caller then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    if c.status not in ('Pending', 'Offered') then
        raise exception 'Only open requests or offers can be declined.' using errcode = '22023';
    end if;
    if length(coalesce(v_reason, '')) > 500 then
        raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
    end if;

    update contract set status = 'Declined', decline_reason = v_reason, closed_at = now()
    where contract_id = p_contract_id;

    perform contract_notify(
        c.tenant_dui, v_caller,
        'Request declined: ' || coalesce(c.property_name, 'a space'),
        'The owner declined your request' || coalesce(': ' || v_reason, '.'),
        p_contract_id
    );
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'declined', 'Declined by the owner' || coalesce(': ' || v_reason, '.'), v_caller);
end;
$$;

create or replace function public.withdraw_contract(p_contract_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
    v_tenant_name text;
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found or c.tenant_dui is distinct from v_caller then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    if c.status not in ('Pending', 'Offered') then
        raise exception 'Only open requests or offers can be withdrawn.' using errcode = '22023';
    end if;
    if length(coalesce(v_reason, '')) > 500 then
        raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
    end if;

    select trim(first_name || ' ' || last_name) into v_tenant_name from users where dui = v_caller;

    update contract set status = 'Withdrawn', decline_reason = v_reason, closed_at = now()
    where contract_id = p_contract_id;

    perform contract_notify(
        c.owner_id, v_caller,
        case when c.status = 'Offered' then 'Offer turned down: ' else 'Request withdrawn: ' end || coalesce(c.property_name, 'your property'),
        coalesce(v_tenant_name, 'The business')
            || case when c.status = 'Offered' then ' turned down your offer' else ' withdrew their request' end
            || coalesce(': ' || v_reason, '.'),
        p_contract_id
    );
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'withdrawn',
            case when c.status = 'Offered' then 'Offer turned down by the business' else 'Request withdrawn by the business' end
            || coalesce(': ' || v_reason, '.'), v_caller);
end;
$$;

-- 9. Early termination (either side asks, the other answers) ---------------------------------------

create or replace function public.request_termination(p_contract_id bigint, p_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_side text;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    v_side := case when c.owner_id = v_caller then 'owner' when c.tenant_dui = v_caller then 'tenant' end;
    if v_side is null then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    if c.status <> 'Active' then
        raise exception 'Only active leases can be ended early.' using errcode = '22023';
    end if;
    if c.termination_requested_at is not null then
        raise exception 'There is already a pending request to end this lease.' using errcode = '22023';
    end if;
    if p_date is null or p_date < sv_today() or p_date <= c.start_date or p_date >= c.end_date then
        raise exception 'Pick an end date from today on, after the start and before the current end date.' using errcode = '22023';
    end if;
    if v_reason is null or length(v_reason) < 5 or length(v_reason) > 500 then
        raise exception 'Explain the reason in 5 to 500 characters.' using errcode = '22023';
    end if;

    update contract
    set termination_requested_by = v_side,
        termination_date = p_date,
        termination_reason = v_reason,
        termination_requested_at = now()
    where contract_id = p_contract_id;

    perform contract_notify(
        case when v_side = 'owner' then c.tenant_dui else c.owner_id end, v_caller,
        'Request to end lease early: ' || coalesce(c.property_name, 'your lease'),
        'The ' || v_side || ' asked to end the lease on ' || to_char(p_date, 'Mon DD, YYYY') || ': ' || v_reason
            || ' Accept or decline it in Contracts.',
        p_contract_id
    );
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'termination_requested',
            'The ' || v_side || ' asked to end the lease on ' || to_char(p_date, 'Mon DD, YYYY') || ': ' || v_reason, v_caller);
end;
$$;

create or replace function public.respond_termination(p_contract_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_side text;
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    v_side := case when c.owner_id = v_caller then 'owner' when c.tenant_dui = v_caller then 'tenant' end;
    if v_side is null then
        raise exception 'Contract not found.' using errcode = '42501';
    end if;
    if c.status <> 'Active' or c.termination_requested_at is null then
        raise exception 'There is no pending request to end this lease.' using errcode = '22023';
    end if;
    if c.termination_requested_by = v_side then
        raise exception 'The other side has to answer this request.' using errcode = '22023';
    end if;

    if p_accept then
        -- Months after the new end are no longer owed; late ones still are.
        update payment
        set status = 'Cancelled'
        where contract_id = p_contract_id
          and status in ('Scheduled', 'Pending')
          and payment_date >= c.termination_date;

        update contract
        set end_date = c.termination_date,
            end_reason = 'terminated',
            termination_requested_at = null
        where contract_id = p_contract_id;

        perform contract_notify(
            case when v_side = 'owner' then c.tenant_dui else c.owner_id end, v_caller,
            'Early end accepted: ' || coalesce(c.property_name, 'your lease'),
            'The lease will now end on ' || to_char(c.termination_date, 'Mon DD, YYYY') || '. Rent after that date was removed from the schedule.',
            p_contract_id
        );
        insert into lease_events (contract_id, kind, message, created_by_dui)
        values (p_contract_id, 'termination_accepted',
                'Early end accepted. The lease ends on ' || to_char(c.termination_date, 'Mon DD, YYYY') || '.', v_caller);
    else
        update contract
        set termination_requested_by = null,
            termination_date = null,
            termination_reason = null,
            termination_requested_at = null
        where contract_id = p_contract_id;

        perform contract_notify(
            case when v_side = 'owner' then c.tenant_dui else c.owner_id end, v_caller,
            'Early end declined: ' || coalesce(c.property_name, 'your lease'),
            'The request to end the lease early was declined. The lease continues until ' || to_char(c.end_date, 'Mon DD, YYYY') || '.',
            p_contract_id
        );
        insert into lease_events (contract_id, kind, message, created_by_dui)
        values (p_contract_id, 'termination_declined', 'The request to end the lease early was declined.', v_caller);
    end if;

    -- An early end dated today takes effect right away.
    perform expire_contracts();
end;
$$;

-- 10. Leases that reached their end date --------------------------------------------------------------

create or replace function public.expire_contracts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    v_n integer := 0;
begin
    for r in
        update contract c
        set status = 'Expired',
            end_reason = coalesce(c.end_reason, 'expired'),
            closed_at = now()
        from add_business b
        where b.property_id = c.property_id
          and c.status = 'Active'
          and c.end_date <= sv_today()
        returning c.contract_id, c.property_id, c.tenant_dui, b.owner_id, b.property_name, c.end_reason
    loop
        if not exists (select 1 from contract a where a.property_id = r.property_id and a.status = 'Active') then
            update add_business set availability = 'Available' where property_id = r.property_id;
        end if;

        perform contract_notify(r.tenant_dui, r.owner_id, 'Lease ended: ' || coalesce(r.property_name, 'your lease'),
            'Your lease has ended. Any rent still owed stays in Payments; the signed contract remains in Contracts.', r.contract_id);
        perform contract_notify(r.owner_id, r.tenant_dui, 'Lease ended: ' || coalesce(r.property_name, 'your property'),
            'This lease has ended and the space is available again in the Marketplace.', r.contract_id);
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'expired',
                case when r.end_reason = 'terminated' then 'The lease ended early, as agreed.' else 'The lease reached its end date.' end);
        v_n := v_n + 1;
    end loop;
    return v_n;
end;
$$;

-- Runs with the daily refresh (pg_cron) and on every Payments/Contracts load.
create or replace function public.refresh_payment_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform expire_contracts();

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

-- 11. Grants ---------------------------------------------------------------------------------------------

revoke all on function public.caller_dui() from public, anon;
revoke all on function public.expire_contracts() from public, anon, authenticated;
revoke all on function public.offer_contract(bigint, date, integer, numeric, numeric, text, text) from public, anon;
revoke all on function public.invite_tenant(bigint, text, date, integer, numeric, numeric, text, text) from public, anon;
revoke all on function public.sign_contract(bigint, text) from public, anon;
revoke all on function public.decline_contract(bigint, text) from public, anon;
revoke all on function public.withdraw_contract(bigint, text) from public, anon;
revoke all on function public.request_termination(bigint, date, text) from public, anon;
revoke all on function public.respond_termination(bigint, boolean) from public, anon;
grant execute on function public.caller_dui() to authenticated;
grant execute on function public.offer_contract(bigint, date, integer, numeric, numeric, text, text) to authenticated;
grant execute on function public.invite_tenant(bigint, text, date, integer, numeric, numeric, text, text) to authenticated;
grant execute on function public.sign_contract(bigint, text) to authenticated;
grant execute on function public.decline_contract(bigint, text) to authenticated;
grant execute on function public.withdraw_contract(bigint, text) to authenticated;
grant execute on function public.request_termination(bigint, date, text) to authenticated;
grant execute on function public.respond_termination(bigint, boolean) to authenticated;
