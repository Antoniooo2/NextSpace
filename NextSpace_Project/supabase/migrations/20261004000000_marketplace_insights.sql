-- Marketplace insights:
--  * property_views: one row per business per space per day (who viewed is
--    never exposed; owners only get counts).
--  * owner_listing_stats(): views, saves and requests per owned space.
--  * market_price_stats(): median rent per m² by type and department, over
--    every listed or leased space (aggregates only, 3+ spaces).
--  * saved_searches: a business saves its Marketplace filters and gets a
--    notification when a new or re-listed space matches.

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create table if not exists public.property_views (
    property_id bigint not null references public.add_business(property_id) on delete cascade,
    viewer_dui varchar not null references public.users(dui) on delete cascade,
    view_date date not null default sv_today(),
    primary key (property_id, viewer_dui, view_date)
);

alter table public.property_views enable row level security;
-- No policies: only the SECURITY DEFINER functions below read or write it.

create or replace function public.record_property_view(p_property_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller varchar := caller_dui();
begin
    if v_caller is null then
        return;
    end if;
    -- Owners looking at their own listing don't count.
    if exists (select 1 from add_business where property_id = p_property_id and owner_id = v_caller) then
        return;
    end if;
    if not exists (select 1 from users where dui = v_caller and account_type = 'business') then
        return;
    end if;
    insert into property_views (property_id, viewer_dui)
    values (p_property_id, v_caller)
    on conflict do nothing;
end;
$$;

create or replace function public.owner_listing_stats()
returns table (property_id bigint, views_30d integer, views_total integer, saves integer, requests_total integer)
language sql
stable
security definer
set search_path = public
as $$
    select b.property_id,
           (select count(*) from property_views v where v.property_id = b.property_id and v.view_date > sv_today() - 30)::int,
           (select count(*) from property_views v where v.property_id = b.property_id)::int,
           (select count(*) from saved_properties s where s.property_id = b.property_id)::int,
           (select count(*) from contract c where c.property_id = b.property_id and c.tenant_dui is not null)::int
    from add_business b
    where b.owner_id = caller_dui()
$$;

-- ---------------------------------------------------------------------------
-- Market price per m²
-- ---------------------------------------------------------------------------
-- department '*' is the type-wide median (fallback when a department has
-- fewer than 3 comparable spaces).
drop function if exists public.market_price_stats();
create function public.market_price_stats()
returns table (property_type text, department text, median_ppm numeric, spaces integer)
language sql
stable
security definer
set search_path = public
as $$
    with priced as (
        select b.property_type, b.department,
               b.monthly_rent / nullif(b.business_size_width * b.business_size_length, 0) as ppm
        from add_business b
        where b.monthly_rent is not null
          and b.business_size_width > 0 and b.business_size_length > 0
          and b.availability in ('Available', 'Occupied')
    )
    select property_type,
           case when grouping(department) = 1 then '*' else department end,
           round(percentile_cont(0.5) within group (order by ppm)::numeric, 2),
           count(*)::int
    from priced
    group by grouping sets ((property_type, department), (property_type))
    having count(*) >= 3 and (grouping(department) = 1 or department is not null)
$$;

-- ---------------------------------------------------------------------------
-- Saved searches and alerts
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_process_check;
alter table public.notifications add constraint notifications_process_check
    check (process in ('Contracts', 'Payments', 'Advisor', 'Marketplace'));

alter table public.notifications
    add column if not exists property_id bigint references public.add_business(property_id) on delete set null;

create table if not exists public.saved_searches (
    search_id bigint generated always as identity primary key,
    user_auth_id uuid not null default auth.uid(),
    label text not null check (length(label) between 1 and 120),
    filters jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.saved_searches enable row level security;
drop policy if exists "Users manage own saved searches" on public.saved_searches;
create policy "Users manage own saved searches" on public.saved_searches
for all using (auth.uid() = user_auth_id) with check (auth.uid() = user_auth_id);

-- One alert per search per space.
create table if not exists public.saved_search_hits (
    search_id bigint not null references public.saved_searches(search_id) on delete cascade,
    property_id bigint not null references public.add_business(property_id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (search_id, property_id)
);
alter table public.saved_search_hits enable row level security;

create or replace function public.saved_search_matches(p_filters jsonb, b public.add_business)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
    v_area numeric := b.business_size_width * b.business_size_length;
    v_text text := lower(coalesce(p_filters->>'query', ''));
begin
    return (coalesce(p_filters->>'category', '') = '' or b.property_type = p_filters->>'category')
       and (coalesce(p_filters->>'department', '') = '' or b.department = p_filters->>'department')
       and (coalesce(p_filters->>'municipality', '') = '' or b.municipality = p_filters->>'municipality')
       and (coalesce(p_filters->>'minPrice', '') = '' or (b.monthly_rent is not null and b.monthly_rent >= (p_filters->>'minPrice')::numeric))
       and (coalesce(p_filters->>'maxPrice', '') = '' or (b.monthly_rent is not null and b.monthly_rent <= (p_filters->>'maxPrice')::numeric))
       and (coalesce(p_filters->>'minArea', '') = '' or v_area >= (p_filters->>'minArea')::numeric)
       and (coalesce(p_filters->>'maxArea', '') = '' or v_area <= (p_filters->>'maxArea')::numeric)
       and (v_text = '' or lower(concat_ws(' ', b.property_name, b.property_type, b.municipality, b.department, b.address)) like '%' || v_text || '%')
       and not exists (
           select 1 from jsonb_array_elements_text(coalesce(p_filters->'services', '[]'::jsonb)) s(id)
           where not exists (
               select 1 from business_services bs where bs.business_id = b.business_id and bs.service_id = s.id::bigint
           )
       );
exception when others then
    return false;
end;
$$;

-- Tell every business whose saved search matches this space (once).
create or replace function public.notify_saved_searches(p_property_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    b public.add_business;
    r record;
    v_n integer := 0;
begin
    select * into b from add_business where property_id = p_property_id;
    if not found or b.availability <> 'Available' then
        return 0;
    end if;

    for r in
        select s.search_id, s.label, u.dui
        from saved_searches s
        join users u on u.id_supabase_auth = s.user_auth_id and u.account_type = 'business'
        where u.dui is distinct from b.owner_id
          and not exists (select 1 from saved_search_hits h where h.search_id = s.search_id and h.property_id = b.property_id)
          and saved_search_matches(s.filters, b)
    loop
        insert into saved_search_hits (search_id, property_id) values (r.search_id, b.property_id) on conflict do nothing;
        insert into notifications (recipient_dui, sender_dui, process, title, description, property_id)
        values (
            r.dui, b.owner_id, 'Marketplace',
            'New space for your search: ' || b.property_name,
            'Matches "' || r.label || '"'
                || coalesce(' · $' || to_char(b.monthly_rent, 'FM999,999,990') || '/month', '')
                || coalesce(' · ' || nullif(concat_ws(', ', b.municipality, b.department), ''), '') || '.',
            b.property_id
        );
        v_n := v_n + 1;
    end loop;
    return v_n;
end;
$$;

-- New listings and re-listed (resumed) spaces. The listing form also calls
-- notify_saved_searches after saving amenities, so amenity filters match.
create or replace function public.listing_saved_search_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.availability = 'Available' and (tg_op = 'INSERT' or old.availability is distinct from 'Available') then
        perform notify_saved_searches(new.property_id);
    end if;
    return null;
end;
$$;

drop trigger if exists listing_saved_search on public.add_business;
create trigger listing_saved_search after insert or update of availability on public.add_business
for each row execute function public.listing_saved_search_trigger();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.record_property_view(bigint) from public, anon;
revoke all on function public.owner_listing_stats() from public, anon;
revoke all on function public.market_price_stats() from public, anon;
revoke all on function public.notify_saved_searches(bigint) from public, anon;
revoke all on function public.listing_saved_search_trigger() from public, anon, authenticated;
grant execute on function public.record_property_view(bigint) to authenticated;
grant execute on function public.owner_listing_stats() to authenticated;
grant execute on function public.market_price_stats() to authenticated;
grant execute on function public.notify_saved_searches(bigint) to authenticated;

-- Daily views of one space for its owner: the last 60 days, zero-filled,
-- so the chart can show the last 30 and compare with the 30 before.
create or replace function public.owner_property_views(p_property_id bigint)
returns table (day date, views integer)
language sql
stable
security definer
set search_path = public
as $$
    select d::date, coalesce(count(v.viewer_dui), 0)::int
    from generate_series(sv_today() - 59, sv_today(), interval '1 day') d
    left join property_views v on v.property_id = p_property_id and v.view_date = d::date
    where exists (select 1 from add_business b where b.property_id = p_property_id and b.owner_id = caller_dui())
    group by d
    order by d
$$;
revoke all on function public.owner_property_views(bigint) from public, anon;
grant execute on function public.owner_property_views(bigint) to authenticated;
