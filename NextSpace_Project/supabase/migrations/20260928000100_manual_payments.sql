-- Lets a property owner record a rent payment received outside Wompi (cash,
-- bank transfer, ...). Owners have no UPDATE policy on payment, so this runs
-- as a checked SECURITY DEFINER function instead: it only accepts the owner
-- of the installment's property, only unpaid installments, and only the
-- allowed methods. The tenant is notified that the payment was recorded.

create or replace function public.record_manual_payment(
    p_payment_id bigint,
    p_method text,
    p_paid_on date default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller_dui varchar;
    v_row record;
    v_paid_on date := coalesce(p_paid_on, sv_today());
begin
    select dui into v_caller_dui from users where id_supabase_auth = auth.uid();
    if v_caller_dui is null then
        raise exception 'Not signed in.' using errcode = '42501';
    end if;

    if p_method not in ('Cash', 'Bank Transfer', 'Debit Card', 'Credit Card', 'Mobile Payment') then
        raise exception 'Invalid payment method.' using errcode = '22023';
    end if;

    if v_paid_on > sv_today() then
        raise exception 'The payment date cannot be in the future.' using errcode = '22023';
    end if;

    select p.payment_id, p.status, p.amount, p.payment_date, c.contract_id, c.tenant_dui,
           b.owner_id, b.property_name
    into v_row
    from payment p
    join contract c on c.contract_id = p.contract_id
    join add_business b on b.property_id = c.property_id
    where p.payment_id = p_payment_id
    for update of p;

    if not found or v_row.owner_id is distinct from v_caller_dui then
        raise exception 'Payment not found.' using errcode = '42501';
    end if;

    if v_row.status not in ('Scheduled', 'Pending', 'Late') then
        raise exception 'This month is not awaiting payment.' using errcode = '22023';
    end if;

    update payment
    set status = 'Paid',
        payment_method = p_method,
        -- Noon El Salvador time, so the date reads the same in any timezone.
        paid_at = (v_paid_on::timestamp + interval '12 hours') at time zone 'America/El_Salvador',
        -- The owner recorded it themself; no "payment received" notice to them.
        notified_at = now()
    where payment_id = p_payment_id;

    insert into notifications (recipient_dui, sender_dui, process, title, description, contract_id)
    values (
        v_row.tenant_dui,
        v_caller_dui,
        'Payments',
        'Payment recorded: ' || coalesce(v_row.property_name, 'your lease'),
        'Your owner recorded your ' || lower(p_method) || ' payment of $'
            || to_char(v_row.amount, 'FM999,999,990.00') || ' for the rent due '
            || to_char(v_row.payment_date, 'Mon DD, YYYY') || ', received on '
            || to_char(v_paid_on, 'Mon DD, YYYY') || '. Your receipt is available in Payments.',
        v_row.contract_id
    );

    return true;
end;
$$;

revoke all on function public.record_manual_payment(bigint, text, date) from public, anon;
grant execute on function public.record_manual_payment(bigint, text, date) to authenticated;
