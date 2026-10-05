-- NextSpace keeps every conversation inside the platform, so phone numbers
-- are not collected or shown anywhere.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
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

alter table public.users drop column if exists phone_number;
alter table public.add_business drop column if exists phone_number;
alter table public.business drop column if exists phone_number;

-- Numbers typed at sign-up also lived in the account metadata.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'phone'
where raw_user_meta_data ? 'phone';
