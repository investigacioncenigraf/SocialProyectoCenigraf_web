begin;
create or replace function public.password_recovery_profile(p_email text)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('name',coalesce(nullif(btrim(raw_user_meta_data->>'nombres'),''),nullif(btrim(raw_user_meta_data->>'given_name'),''),nullif(btrim(raw_user_meta_data->>'full_name'),''),nullif(btrim(raw_user_meta_data->>'name'),''),''))
 from auth.users where lower(email)=p_email and email_confirmed_at is not null limit 1;
$$;
revoke all on function public.password_recovery_profile(text) from public,anon,authenticated;
grant execute on function public.password_recovery_profile(text) to service_role;
commit;
