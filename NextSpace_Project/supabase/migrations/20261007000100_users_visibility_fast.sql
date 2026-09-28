-- The per-row can_see_user() check ran for every user row inside every
-- policy that looks up the caller, which timed out bigger pages (My
-- Properties with photos and amenities). Same rule, computed once per query
-- as a set of visible DUIs.
create or replace function public.visible_user_duis() returns setof varchar language sql stable security definer set search_path to 'public' as $$
    with me as (select dui from users where id_supabase_auth = auth.uid())
    select dui from me
    union select b.owner_id from add_business b where b.availability = 'Available'
    union select c.tenant_dui from contract c join add_business b on b.property_id = c.property_id join me on b.owner_id = me.dui
    union select b.owner_id from contract c join add_business b on b.property_id = c.property_id join me on c.tenant_dui = me.dui
    union select n.sender_dui from notifications n join me on n.recipient_dui = me.dui where n.sender_dui is not null
$$;
revoke all on function public.visible_user_duis() from public, anon;
grant execute on function public.visible_user_duis() to authenticated;

drop policy if exists "Users can read people they deal with" on public.users;
create policy "Users can read people they deal with" on public.users for select to authenticated
    using (dui in (select public.visible_user_duis()));

drop function if exists public.can_see_user(varchar);
