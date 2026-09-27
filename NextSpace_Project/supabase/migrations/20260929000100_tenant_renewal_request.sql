-- Tenant side of lease renewals: in the last 60 days of an Active lease the
-- tenant can ask the owner to renew. Same safeguards as send_tenant_notice:
-- only the lease's own tenant, only in the window, at most once a day. The
-- request is logged in lease_events so both sides see it in the lease's
-- activity.

alter table public.lease_events drop constraint if exists lease_events_kind_check;
alter table public.lease_events add constraint lease_events_kind_check
    check (kind in ('reminder', 'auto_reminder', 'renewal_offer', 'renewal_request'));

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
        'Contracts',
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
