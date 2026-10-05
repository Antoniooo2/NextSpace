-- The caller's own payment record as a tenant: the same figures an owner
-- sees next to a lease request (applicant_records), for the Profile page.
create or replace function public.my_tenant_record()
returns table(leases integer, active_leases integer, completed_leases integer,
              months_due integer, months_on_time integer, months_late_now integer)
language sql
stable security definer
set search_path to 'public'
as $$
    select
        (select count(*) from contract k where k.tenant_dui = me.dui and k.tenant_signed_at is not null)::int,
        (select count(*) from contract k where k.tenant_dui = me.dui and k.status = 'Active')::int,
        (select count(*) from contract k where k.tenant_dui = me.dui and k.status = 'Expired'
            and coalesce(k.end_reason, 'expired') = 'expired')::int,
        count(p.payment_id)::int,
        (count(p.payment_id) filter (
            where p.status = 'Paid' and p.paid_at is not null
              and (p.paid_at at time zone 'America/El_Salvador')::date <= p.payment_date))::int,
        (count(p.payment_id) filter (where p.status = 'Late'))::int
    from (select caller_dui() as dui) me
    left join contract k2 on k2.tenant_dui = me.dui
    left join payment p on p.contract_id = k2.contract_id
        and p.status <> 'Cancelled'
        and p.payment_date <= sv_today()
    where me.dui is not null
    group by me.dui
$$;

revoke all on function public.my_tenant_record() from public, anon;
grant execute on function public.my_tenant_record() to authenticated;
