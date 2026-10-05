-- Project audit: close the gaps that let people step around NextSpace's
-- rules, and drop what nothing uses.

-- A1/A3. Rent is only paid online through Wompi. Owners can no longer write
-- payment rows themselves, and the only method stored is 'Wompi'.
drop policy if exists "Owners can record payments on their contracts" on public.payment;

alter table public.payment drop constraint if exists payment_payment_method_check;
update public.payment set payment_method = 'Wompi' where payment_method is not null;
alter table public.payment
    add constraint payment_payment_method_check check (payment_method is null or payment_method = 'Wompi');

-- B1. From the app a person can change their name only. DUI, account type
-- and the auth link are fixed after sign-up.
create or replace function public.users_update_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
    if current_user in ('authenticated', 'anon') and (
        new.dui is distinct from old.dui
        or new.account_type is distinct from old.account_type
        or new.id_supabase_auth is distinct from old.id_supabase_auth
        or new.created_at is distinct from old.created_at
    ) then
        raise exception 'Only your name can be changed.' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists users_update_guard on public.users;
create trigger users_update_guard before update on public.users
    for each row execute function public.users_update_guard();

-- Only property owners publish spaces, only businesses request them.
drop policy if exists "Owners can insert own properties" on public.add_business;
create policy "Owners can insert own properties" on public.add_business
    for insert with check (
        (owner_id)::text = (select users.dui from users where users.id_supabase_auth = auth.uid())::text
        and (select users.account_type from users where users.id_supabase_auth = auth.uid()) = 'property-owner'
    );

drop policy if exists "Tenants can request a contract on available properties" on public.contract;
create policy "Tenants can request a contract on available properties" on public.contract
    for insert with check (
        (tenant_dui)::text = (select users.dui from users where users.id_supabase_auth = auth.uid())::text
        and (select users.account_type from users where users.id_supabase_auth = auth.uid()) = 'business'
        and status = 'Pending'
        and property_id in (select property_id from add_business where availability = 'Available')
        and business_id in (select business_id from add_business where availability = 'Available')
    );

-- B2. People only see the accounts they deal with: themselves, owners of
-- listed spaces, the other side of their leases and requests, and whoever
-- sent them a notification.
create or replace function public.can_see_user(p_dui varchar)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select p_dui = caller_dui()
        or exists (select 1 from add_business b where b.owner_id = p_dui and b.availability = 'Available')
        or exists (
            select 1 from contract c join add_business b on b.property_id = c.property_id
            where (c.tenant_dui = p_dui and b.owner_id = caller_dui())
               or (b.owner_id = p_dui and c.tenant_dui = caller_dui())
        )
        or exists (select 1 from notifications n where n.sender_dui = p_dui and n.recipient_dui = caller_dui())
$$;

revoke all on function public.can_see_user(varchar) from public, anon;
grant execute on function public.can_see_user(varchar) to authenticated;

drop policy if exists "Authenticated users can read basic profile info" on public.users;
create policy "Users can read people they deal with" on public.users
    for select to authenticated using (public.can_see_user(dui));

-- B3. DUI format (########-#) checked at sign-up as well as in the form.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.raw_user_meta_data->>'dui', '') !~ '^\d{8}-\d$' then
    raise exception 'Invalid DUI format.' using errcode = '22023';
  end if;
  insert into public.users (dui, id_supabase_auth, first_name, last_name, account_type)
  values (
    new.raw_user_meta_data->>'dui',
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'account_type'
  );
  return new;
end;
$function$;

-- B4. Trigger functions are not API endpoints, and the two date helpers get
-- a fixed search_path.
revoke execute on function public.contract_rent_schedule_trigger() from public, anon, authenticated;
revoke execute on function public.contract_request_logged() from public, anon, authenticated;
revoke execute on function public.contract_mark_invite() from public, anon, authenticated;
revoke execute on function public.listing_saved_search_trigger() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.users_update_guard() from public, anon, authenticated;
alter function public.sv_today() set search_path to 'public';
alter function public.installment_status_for(date) set search_path to 'public';

-- D1-D5. Unused tables, view, function and column.
drop table if exists public.reviews;
drop table if exists public.business;
drop view if exists public.users_public;
drop function if exists public.send_renewal_request(bigint, text);
alter table public.add_business drop column if exists proof_of_ownership;
