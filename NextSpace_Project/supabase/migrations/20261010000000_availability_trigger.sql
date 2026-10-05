-- Availability follows the lease, enforced in the database.
--
--  * When a contract becomes Active the space is set to 'Occupied'.
--  * When a contract leaves Active (Expired, Cancelled, ...) and no other
--    Active contract remains, a space that was 'Occupied' goes back to
--    'Available'. A 'Reserved' (paused) space is left alone.
--  * A Pending request is refused with a clear message when the space is not
--    Available, or when the same business already has an open request there.
--
-- The functions are SECURITY DEFINER: they run as the table owner, so they
-- see every row and bypass listing_availability_guard (which only restricts
-- direct writes from authenticated/anon clients).
--
-- Already in place and unchanged: the SELECT policy "Anyone can read available
-- properties" (availability = 'Available') next to "Owners can read own
-- properties", and the unique index contract_one_open_request.

-- 1. Keep add_business.availability in step with the contract table -------------

create or replace function public.sync_property_availability(p_property_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (select 1 from contract where property_id = p_property_id and status = 'Active') then
        update add_business set availability = 'Occupied'
        where property_id = p_property_id and availability is distinct from 'Occupied';
    else
        update add_business set availability = 'Available'
        where property_id = p_property_id and availability = 'Occupied';
    end if;
end;
$$;

create or replace function public.contract_sync_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op in ('INSERT', 'UPDATE') and new.status = 'Active' then
        perform sync_property_availability(new.property_id);
    end if;
    if tg_op in ('UPDATE', 'DELETE') and old.status = 'Active'
       and (tg_op = 'DELETE' or new.status is distinct from 'Active' or new.property_id is distinct from old.property_id) then
        perform sync_property_availability(old.property_id);
    end if;
    return null;
end;
$$;

revoke all on function public.sync_property_availability(bigint) from public, anon, authenticated;
revoke all on function public.contract_sync_availability() from public, anon, authenticated;

drop trigger if exists contract_sync_availability on public.contract;
create trigger contract_sync_availability
after insert or update of status, property_id or delete on public.contract
for each row execute function public.contract_sync_availability();

-- 2. Friendly refusal for new requests -------------------------------------------
-- The INSERT policy already limits requests to Available spaces and the unique
-- index blocks a second open request; this runs first and says why.

create or replace function public.contract_request_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_availability text;
begin
    if new.status is distinct from 'Pending' then
        return new;
    end if;

    select availability into v_availability from add_business where property_id = new.property_id;
    if v_availability = 'Occupied' then
        raise exception 'This space is already occupied.' using errcode = '22023';
    end if;

    if exists (
        select 1 from contract c
        where c.property_id = new.property_id
          and c.tenant_dui = new.tenant_dui
          and c.status = 'Pending'
    ) then
        raise exception 'You already have a pending request for this space.' using errcode = '23505';
    end if;
    return new;
end;
$$;

revoke all on function public.contract_request_guard() from public, anon, authenticated;

drop trigger if exists contract_request_guard on public.contract;
create trigger contract_request_guard
before insert on public.contract
for each row execute function public.contract_request_guard();
