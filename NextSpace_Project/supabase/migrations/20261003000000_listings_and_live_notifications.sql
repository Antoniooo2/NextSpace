-- Marketplace / My Properties / Notifications refresh.
--  * Availability follows the lease: only the contract flow sets 'Occupied'.
--    Owners can only list ('Available') or pause ('Reserved') a space that
--    has no active lease.
--  * A space with lease history can't be deleted (pause it instead).
--  * Up to 6 photos per space, ordered, first one is the cover.
--  * Tenants can see the photos/services of the space they lease.
--  * Notifications are published to Realtime so the bell updates live.

-- ---------------------------------------------------------------------------
-- Availability guard (direct client writes only; SECURITY DEFINER functions
-- such as sign_contract/expire_contracts run as the table owner)
-- ---------------------------------------------------------------------------
create or replace function public.listing_availability_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user not in ('authenticated', 'anon') then
        return new;
    end if;

    if tg_op = 'INSERT' then
        if new.availability is null or new.availability not in ('Available', 'Reserved') then
            new.availability := 'Available';
        end if;
        return new;
    end if;

    if new.availability is distinct from old.availability then
        if exists (select 1 from contract where property_id = old.property_id and status = 'Active') then
            raise exception 'This space has an active lease, so it stays Occupied until the lease ends.'
                using errcode = '22023';
        end if;
        if new.availability not in ('Available', 'Reserved') then
            raise exception 'A space becomes Occupied only when a lease is signed.' using errcode = '22023';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists listing_availability_guard on public.add_business;
create trigger listing_availability_guard before insert or update on public.add_business
for each row execute function public.listing_availability_guard();

-- ---------------------------------------------------------------------------
-- Delete guard: friendly message instead of a foreign-key error.
-- ---------------------------------------------------------------------------
create or replace function public.listing_delete_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if exists (select 1 from contract where property_id = old.property_id and status in ('Active', 'Pending', 'Offered')) then
        raise exception 'This space has an active lease or open requests. Pause the listing instead.' using errcode = '22023';
    end if;
    if exists (select 1 from contract where property_id = old.property_id) then
        raise exception 'This space has lease history, so it can''t be deleted. Pause the listing to hide it from the Marketplace.'
            using errcode = '22023';
    end if;
    return old;
end;
$$;

drop trigger if exists listing_delete_guard on public.add_business;
create trigger listing_delete_guard before delete on public.add_business
for each row execute function public.listing_delete_guard();

-- ---------------------------------------------------------------------------
-- Photos: order (0 = cover) and at most 6 per space.
-- ---------------------------------------------------------------------------
alter table public.business_photos add column if not exists sort_order integer not null default 0;

create or replace function public.business_photos_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if (select count(*) from business_photos where property_id = new.property_id) >= 6 then
        raise exception 'A space can have up to 6 photos.' using errcode = '22023';
    end if;
    return new;
end;
$$;

drop trigger if exists business_photos_limit on public.business_photos;
create trigger business_photos_limit before insert on public.business_photos
for each row execute function public.business_photos_limit();

drop policy if exists "Owners can update photos of their properties" on public.business_photos;
create policy "Owners can update photos of their properties" on public.business_photos
for update using (
    property_id in (select property_id from add_business where owner_id = (select dui from users where id_supabase_auth = auth.uid()))
) with check (
    property_id in (select property_id from add_business where owner_id = (select dui from users where id_supabase_auth = auth.uid()))
);

-- Tenants see the space they lease (photos and amenities), like the listing.
drop policy if exists "Tenants can read photos of their leased properties" on public.business_photos;
create policy "Tenants can read photos of their leased properties" on public.business_photos
for select to authenticated using (
    is_property_tenant(property_id, (select dui from users where id_supabase_auth = auth.uid()))
);

drop policy if exists "Tenants can read services of their leased properties" on public.business_services;
create policy "Tenants can read services of their leased properties" on public.business_services
for select to authenticated using (
    business_id in (
        select b.business_id from add_business b
        where is_property_tenant(b.property_id, (select dui from users where id_supabase_auth = auth.uid()))
    )
);

-- ---------------------------------------------------------------------------
-- Live notifications
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
        alter publication supabase_realtime add table public.notifications;
    end if;
end;
$$;
