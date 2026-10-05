-- Contracts phases 3-5: real renewals, the applicant's record on NextSpace,
-- and contract automations (unanswered requests, offer reminders/expiry).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.contract
    add column if not exists origin text not null default 'request',
    add column if not exists request_reminded_at timestamptz,
    add column if not exists offer_reminded_at timestamptz,
    -- Tenant's renewal request (waiting for the owner's offer)
    add column if not exists renewal_requested_at timestamptz,
    add column if not exists renewal_request_months integer,
    add column if not exists renewal_request_note text,
    -- Owner's renewal offer (waiting for the tenant's signature)
    add column if not exists renewal_months integer,
    add column if not exists renewal_rent numeric,
    add column if not exists renewal_note text,
    add column if not exists renewal_offered_at timestamptz,
    add column if not exists renewal_expires_at timestamptz,
    add column if not exists renewal_owner_signed_name text,
    add column if not exists renewal_reminded_at timestamptz,
    -- Last signed renewal
    add column if not exists renewal_count integer not null default 0,
    add column if not exists last_renewed_at timestamptz,
    add column if not exists last_renewal_owner_name text,
    add column if not exists last_renewal_tenant_name text,
    add column if not exists previous_rent numeric,
    add column if not exists rent_changes_from date;

alter table public.contract drop constraint if exists contract_origin_check;
alter table public.contract add constraint contract_origin_check check (origin in ('request', 'invite'));

-- Invitations made before this migration.
update public.contract c set origin = 'invite'
where exists (select 1 from lease_events e where e.contract_id = c.contract_id and e.kind = 'invited');

alter table public.lease_events drop constraint if exists lease_events_kind_check;
alter table public.lease_events add constraint lease_events_kind_check check (kind in (
    'reminder', 'auto_reminder', 'renewal_offer', 'renewal_request',
    'requested', 'invited', 'offered', 'signed', 'declined', 'auto_declined', 'withdrawn',
    'termination_requested', 'termination_accepted', 'termination_declined', 'expired',
    'renewed', 'renewal_declined', 'renewal_expired', 'offer_expired', 'request_reminder', 'offer_reminder'
));

-- invite_tenant marks its rows as invitations.
create or replace function public.contract_mark_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.kind = 'invited' then
        update contract set origin = 'invite' where contract_id = new.contract_id;
    end if;
    return null;
end;
$$;

drop trigger if exists lease_event_marks_invite on public.lease_events;
create trigger lease_event_marks_invite after insert on public.lease_events
for each row execute function public.contract_mark_invite();

-- ---------------------------------------------------------------------------
-- Renewal
-- ---------------------------------------------------------------------------
create or replace function public.request_renewal(p_contract_id bigint, p_months integer, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found or c.tenant_dui is distinct from v_caller then
        raise exception 'Lease not found.' using errcode = '42501';
    end if;
    if c.status <> 'Active' then
        raise exception 'Only active leases can be renewed.' using errcode = '22023';
    end if;
    if c.termination_requested_at is not null then
        raise exception 'There is an early-end request open on this lease.' using errcode = '22023';
    end if;
    if c.end_date - sv_today() > 90 then
        raise exception 'Renewals open 90 days before the lease ends.' using errcode = '22023';
    end if;
    if c.renewal_offered_at is not null then
        raise exception 'The owner already sent you a renewal offer. Review it in Contracts.' using errcode = '22023';
    end if;
    if c.renewal_requested_at is not null then
        raise exception 'You already asked to renew. The owner will answer with an offer.' using errcode = '22023';
    end if;
    if p_months is null or p_months < 1 or p_months > 60 then
        raise exception 'Choose between 1 and 60 months.' using errcode = '22023';
    end if;
    if length(coalesce(v_note, '')) > 1200 then
        raise exception 'The note is limited to 1200 characters.' using errcode = '22023';
    end if;

    update contract
    set renewal_requested_at = now(), renewal_request_months = p_months, renewal_request_note = v_note
    where contract_id = p_contract_id;

    perform contract_notify(c.owner_id, v_caller, 'Renewal request: ' || coalesce(c.property_name, 'your property'),
        'Your tenant would like to renew for ' || p_months || case when p_months = 1 then ' month' else ' months' end
            || coalesce('. "' || v_note || '"', '.') || ' Answer with a renewal offer in Contracts.',
        p_contract_id);
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'renewal_request', 'Asked to renew for ' || p_months || ' months.' || coalesce(' "' || v_note || '"', ''), v_caller);
end;
$$;

create or replace function public.offer_renewal(p_contract_id bigint, p_months integer, p_rent numeric, p_note text, p_owner_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_name text := btrim(coalesce(p_owner_name, ''));
    v_note text := nullif(btrim(coalesce(p_note, '')), '');
    v_new_end date;
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found or c.owner_id is distinct from v_caller then
        raise exception 'Lease not found.' using errcode = '42501';
    end if;
    if c.status <> 'Active' then
        raise exception 'Only active leases can be renewed.' using errcode = '22023';
    end if;
    if c.termination_requested_at is not null then
        raise exception 'There is an early-end request open on this lease.' using errcode = '22023';
    end if;
    if c.end_date - sv_today() > 90 then
        raise exception 'Renewals open 90 days before the lease ends.' using errcode = '22023';
    end if;
    if p_months is null or p_months < 1 or p_months > 60 then
        raise exception 'Choose between 1 and 60 months.' using errcode = '22023';
    end if;
    if p_rent is null or p_rent <= 0 then
        raise exception 'The monthly rent must be greater than zero.' using errcode = '22023';
    end if;
    if length(coalesce(v_note, '')) > 1200 then
        raise exception 'The note is limited to 1200 characters.' using errcode = '22023';
    end if;
    if length(v_name) < 3 then
        raise exception 'Type your full name to sign the offer.' using errcode = '22023';
    end if;

    v_new_end := (c.end_date + make_interval(months => p_months))::date;

    update contract
    set renewal_months = p_months,
        renewal_rent = p_rent,
        renewal_note = v_note,
        renewal_owner_signed_name = v_name,
        renewal_offered_at = now(),
        renewal_expires_at = now() + interval '7 days',
        renewal_reminded_at = null,
        renewal_requested_at = null,
        renewal_request_months = null,
        renewal_request_note = null
    where contract_id = p_contract_id;

    perform contract_notify(c.tenant_dui, v_caller, 'Renewal offer: ' || coalesce(c.property_name, 'your lease'),
        'The owner offers to extend your lease to ' || to_char(v_new_end, 'Mon DD, YYYY') || ' at $'
            || to_char(p_rent, 'FM999,999,990.00') || '/month. Review and sign it in Contracts within 7 days.',
        p_contract_id);
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'renewal_offer',
            'Renewal offer: ' || p_months || ' more months (to ' || to_char(v_new_end, 'Mon DD, YYYY') || ') at $'
            || to_char(p_rent, 'FM999,999,990.00') || '/month. Signed by ' || v_name || '.', v_caller);
end;
$$;

create or replace function public.sign_renewal(p_contract_id bigint, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_name text := btrim(coalesce(p_name, ''));
    v_new_end date;
    v_code text;
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found or c.tenant_dui is distinct from v_caller then
        raise exception 'Lease not found.' using errcode = '42501';
    end if;
    if c.status <> 'Active' then
        raise exception 'This lease is no longer active.' using errcode = '22023';
    end if;
    if c.renewal_offered_at is null then
        raise exception 'There is no renewal offer to sign.' using errcode = '22023';
    end if;
    if c.termination_requested_at is not null then
        raise exception 'There is an early-end request open on this lease.' using errcode = '22023';
    end if;
    if c.renewal_expires_at < now() then
        raise exception 'This renewal offer expired. Ask the owner to send it again.' using errcode = '22023';
    end if;
    if length(v_name) < 3 then
        raise exception 'Type your full name to sign.' using errcode = '22023';
    end if;

    v_new_end := (c.end_date + make_interval(months => c.renewal_months))::date;
    v_code := upper(substr(md5(c.contract_id || '|renewal|' || c.renewal_count || '|' || v_new_end || '|' || c.renewal_rent || '|' || now()), 1, 12));

    -- New months come from contract_rent_schedule (end_date changes) at the
    -- new rent; months already scheduled keep their amount.
    update contract
    set previous_rent = case when c.renewal_rent <> c.monthly_rent then c.monthly_rent else previous_rent end,
        rent_changes_from = case when c.renewal_rent <> c.monthly_rent then c.end_date else rent_changes_from end,
        monthly_rent = c.renewal_rent,
        end_date = v_new_end,
        duration_months = coalesce(duration_months, 0) + c.renewal_months,
        renewal_count = renewal_count + 1,
        last_renewed_at = now(),
        last_renewal_owner_name = c.renewal_owner_signed_name,
        last_renewal_tenant_name = v_name,
        verification_code = v_code,
        end_notice_60_at = null,
        end_notice_30_at = null,
        renewal_months = null, renewal_rent = null, renewal_note = null, renewal_offered_at = null,
        renewal_expires_at = null, renewal_owner_signed_name = null, renewal_reminded_at = null
    where contract_id = p_contract_id;

    perform contract_notify(c.owner_id, v_caller, 'Lease renewed: ' || coalesce(c.property_name, 'your property'),
        v_name || ' signed the renewal. The lease now runs to ' || to_char(v_new_end, 'Mon DD, YYYY')
            || ' and the new months are in Payments.', p_contract_id);
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'renewed',
            'Renewal signed by ' || v_name || '. New end ' || to_char(v_new_end, 'Mon DD, YYYY') || ', $'
            || to_char(c.renewal_rent, 'FM999,999,990.00') || '/month. Verification code ' || v_code || '.', v_caller);
    return v_code;
end;
$$;

-- Owner turns down a request or withdraws their offer; tenant turns down an offer.
create or replace function public.decline_renewal(p_contract_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
    c record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
    v_is_owner boolean;
    v_msg text;
begin
    select k.*, b.owner_id, b.property_name into c
    from contract k join add_business b on b.property_id = k.property_id
    where k.contract_id = p_contract_id for update of k;

    if not found or v_caller is null or (c.owner_id is distinct from v_caller and c.tenant_dui is distinct from v_caller) then
        raise exception 'Lease not found.' using errcode = '42501';
    end if;
    v_is_owner := c.owner_id = v_caller;

    if c.renewal_offered_at is null and c.renewal_requested_at is null then
        raise exception 'There is no renewal in progress.' using errcode = '22023';
    end if;

    update contract
    set renewal_months = null, renewal_rent = null, renewal_note = null, renewal_offered_at = null,
        renewal_expires_at = null, renewal_owner_signed_name = null, renewal_reminded_at = null,
        renewal_requested_at = null, renewal_request_months = null, renewal_request_note = null
    where contract_id = p_contract_id;

    v_msg := case
        when v_is_owner and c.renewal_offered_at is not null then 'The owner withdrew the renewal offer.'
        when v_is_owner then 'The owner declined the renewal request.'
        when c.renewal_offered_at is not null then 'The tenant turned down the renewal offer.'
        else 'The tenant cancelled the renewal request.'
    end || coalesce(' "' || v_reason || '"', '');

    perform contract_notify(
        case when v_is_owner then c.tenant_dui else c.owner_id end, v_caller,
        'Renewal not going ahead: ' || coalesce(c.property_name, 'your lease'),
        v_msg || ' The lease still ends on ' || to_char(c.end_date, 'Mon DD, YYYY') || '.', p_contract_id);
    insert into lease_events (contract_id, kind, message, created_by_dui)
    values (p_contract_id, 'renewal_declined', v_msg, v_caller);
end;
$$;

-- ---------------------------------------------------------------------------
-- Applicant record: aggregate only (no amounts, properties or other owners),
-- visible to an owner who has a contract of any status with that business.
-- ---------------------------------------------------------------------------
create or replace function public.applicant_records(p_duis text[])
returns table (
    tenant_dui varchar,
    leases integer,
    active_leases integer,
    completed_leases integer,
    months_due integer,
    months_on_time integer,
    months_late_now integer,
    member_since date
)
language sql
stable
security definer
set search_path = public
as $$
    select u.dui,
           (select count(*) from contract k where k.tenant_dui = u.dui and k.tenant_signed_at is not null)::int,
           (select count(*) from contract k where k.tenant_dui = u.dui and k.status = 'Active')::int,
           (select count(*) from contract k where k.tenant_dui = u.dui and k.status = 'Expired' and coalesce(k.end_reason, 'expired') = 'expired')::int,
           count(p.payment_id)::int,
           (count(p.payment_id) filter (
               where p.status = 'Paid' and p.paid_at is not null
                 and (p.paid_at at time zone 'America/El_Salvador')::date <= p.payment_date))::int,
           (count(p.payment_id) filter (where p.status = 'Late'))::int,
           (select least(min(k.requested_at)::date, min(k.start_date)) from contract k where k.tenant_dui = u.dui)
    from users u
    left join contract k2 on k2.tenant_dui = u.dui
    left join payment p on p.contract_id = k2.contract_id
        and p.status <> 'Cancelled'
        and p.payment_date <= sv_today()
    where u.dui = any(p_duis)
      and exists (
          select 1 from contract mine join add_business b on b.property_id = mine.property_id
          where mine.tenant_dui = u.dui and b.owner_id = caller_dui()
      )
    group by u.dui
$$;

-- ---------------------------------------------------------------------------
-- Automations, run by refresh_payment_statuses (daily cron + screen loads)
-- ---------------------------------------------------------------------------
create or replace function public.contract_automations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    v_n integer := 0;
begin
    -- Requests unanswered for 3 days: nudge the owner once.
    for r in
        update contract c set request_reminded_at = now()
        from add_business b
        where b.property_id = c.property_id
          and c.status = 'Pending'
          and c.request_reminded_at is null
          and c.requested_at < now() - interval '3 days'
        returning c.contract_id, c.tenant_dui, b.owner_id, b.property_name, c.requested_at
    loop
        perform contract_notify(r.owner_id, r.tenant_dui, 'Request waiting 3 days: ' || coalesce(r.property_name, 'your property'),
            'A business asked to lease this space on ' || to_char(r.requested_at at time zone 'America/El_Salvador', 'Mon DD')
                || ' and is still waiting. Answer with an offer or decline it in Contracts.', r.contract_id);
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'request_reminder', 'Reminder sent to the owner: request waiting 3 days.');
        v_n := v_n + 1;
    end loop;

    -- Offers with 2 days or less left: remind the tenant once.
    for r in
        update contract c set offer_reminded_at = now()
        from add_business b
        where b.property_id = c.property_id
          and c.status = 'Offered'
          and c.offer_reminded_at is null
          and c.offer_expires_at > now()
          and c.offer_expires_at <= now() + interval '2 days'
        returning c.contract_id, c.tenant_dui, b.owner_id, b.property_name, c.offer_expires_at
    loop
        perform contract_notify(r.tenant_dui, r.owner_id, 'Offer expires soon: ' || coalesce(r.property_name, 'a space'),
            'Your lease offer expires on ' || to_char(r.offer_expires_at at time zone 'America/El_Salvador', 'Mon DD, HH12:MI AM')
                || '. Review and sign it in Contracts before then.', r.contract_id);
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'offer_reminder', 'Reminder sent to the business: the offer expires soon.');
        v_n := v_n + 1;
    end loop;

    -- Expired offers: a request goes back to Pending so the owner can
    -- re-offer; an invitation closes.
    for r in
        update contract c
        set status = case when c.origin = 'invite' then 'Declined' else 'Pending' end,
            decline_reason = case when c.origin = 'invite' then 'The invitation expired without a signature.' else c.decline_reason end,
            closed_at = case when c.origin = 'invite' then now() else c.closed_at end,
            start_date = case when c.origin = 'invite' then c.start_date else null end,
            end_date = case when c.origin = 'invite' then c.end_date else null end,
            owner_signed_name = case when c.origin = 'invite' then c.owner_signed_name else null end,
            owner_signed_at = case when c.origin = 'invite' then c.owner_signed_at else null end,
            offer_reminded_at = null,
            request_reminded_at = case when c.origin = 'invite' then c.request_reminded_at else now() end
        from add_business b
        where b.property_id = c.property_id
          and c.status = 'Offered'
          and c.offer_expires_at <= now()
        returning c.contract_id, c.tenant_dui, b.owner_id, b.property_name, c.origin
    loop
        perform contract_notify(r.tenant_dui, r.owner_id, 'Offer expired: ' || coalesce(r.property_name, 'a space'),
            case when r.origin = 'invite'
                 then 'The lease invitation expired without a signature.'
                 else 'The lease offer expired without a signature. Your request is still open; the owner can send a new offer.' end,
            r.contract_id);
        perform contract_notify(r.owner_id, r.tenant_dui, 'Offer expired: ' || coalesce(r.property_name, 'your property'),
            case when r.origin = 'invite'
                 then 'Your invitation expired without a signature and was closed.'
                 else 'Your offer expired without a signature. The request is open again if you want to send a new offer.' end,
            r.contract_id);
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'offer_expired', 'The offer expired after 7 days without a signature.');
        v_n := v_n + 1;
    end loop;

    -- Renewal offers: reminder with 2 days left, then expiry.
    for r in
        update contract c set renewal_reminded_at = now()
        from add_business b
        where b.property_id = c.property_id
          and c.status = 'Active'
          and c.renewal_offered_at is not null
          and c.renewal_reminded_at is null
          and c.renewal_expires_at > now()
          and c.renewal_expires_at <= now() + interval '2 days'
        returning c.contract_id, c.tenant_dui, b.owner_id, b.property_name
    loop
        perform contract_notify(r.tenant_dui, r.owner_id, 'Renewal offer expires soon: ' || coalesce(r.property_name, 'your lease'),
            'Review and sign the renewal in Contracts within 2 days, or it will expire.', r.contract_id);
        v_n := v_n + 1;
    end loop;

    for r in
        update contract c
        set renewal_months = null, renewal_rent = null, renewal_note = null, renewal_offered_at = null,
            renewal_expires_at = null, renewal_owner_signed_name = null, renewal_reminded_at = null
        from add_business b
        where b.property_id = c.property_id
          and c.renewal_offered_at is not null
          and c.renewal_expires_at <= now()
        returning c.contract_id, c.tenant_dui, b.owner_id, b.property_name
    loop
        perform contract_notify(r.owner_id, r.tenant_dui, 'Renewal offer expired: ' || coalesce(r.property_name, 'your property'),
            'The tenant did not sign the renewal within 7 days. You can send a new offer from Contracts.', r.contract_id);
        perform contract_notify(r.tenant_dui, r.owner_id, 'Renewal offer expired: ' || coalesce(r.property_name, 'your lease'),
            'The renewal offer expired. You can ask the owner to renew from Contracts.', r.contract_id);
        insert into lease_events (contract_id, kind, message)
        values (r.contract_id, 'renewal_expired', 'The renewal offer expired after 7 days without a signature.');
        v_n := v_n + 1;
    end loop;

    return v_n;
end;
$$;

create or replace function public.refresh_payment_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform expire_contracts();
    perform contract_automations();

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

-- End-of-lease notices now point to the renewal flow in Contracts.
do $$
declare
    v_def text := pg_get_functiondef('public.send_rent_reminders'::regproc);
begin
    v_def := replace(v_def, 'you can ask to renew from Payments', 'you can ask to renew from Contracts');
    v_def := replace(v_def, 'You can offer the tenant a renewal from Payments', 'You can offer the tenant a renewal from Contracts');
    v_def := replace(v_def, 'now is the time to ask from Payments', 'now is the time to ask from Contracts');
    v_def := replace(v_def, 'Offer a renewal from Payments', 'Offer a renewal from Contracts');
    execute v_def;
end;
$$;

revoke all on function public.contract_automations() from public, anon, authenticated;
revoke all on function public.contract_mark_invite() from public, anon, authenticated;
grant execute on function public.request_renewal(bigint, integer, text) to authenticated;
grant execute on function public.offer_renewal(bigint, integer, numeric, text, text) to authenticated;
grant execute on function public.sign_renewal(bigint, text) to authenticated;
grant execute on function public.decline_renewal(bigint, text) to authenticated;
grant execute on function public.applicant_records(text[]) to authenticated;
revoke execute on function public.request_renewal(bigint, integer, text) from anon, public;
revoke execute on function public.offer_renewal(bigint, integer, numeric, text, text) from anon, public;
revoke execute on function public.sign_renewal(bigint, text) from anon, public;
revoke execute on function public.decline_renewal(bigint, text) from anon, public;
revoke execute on function public.applicant_records(text[]) from anon, public;
