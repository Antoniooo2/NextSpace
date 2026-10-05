create or replace function public.landing_department_counts()
returns table (department text, spaces integer)
language sql
stable
security definer
set search_path = public
as $$
    select b.department, count(*)::int
    from add_business b
    where b.availability = 'Available'
      and b.department is not null
    group by b.department
$$;

revoke all on function public.landing_department_counts() from public;
grant execute on function public.landing_department_counts() to anon, authenticated;
