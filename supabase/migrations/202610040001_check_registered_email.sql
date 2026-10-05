-- Consulta únicamente existencia: no expone perfiles, hashes ni listas de usuarios.
-- Ejecutar en el SQL Editor de Supabase con el rol postgres.
begin;
create or replace function public.is_email_registered(candidate_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_email text := pg_catalog.lower(pg_catalog.btrim(candidate_email));
begin
  if normalized_email is null
     or pg_catalog.length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@(soy\.)?sena\.edu\.co$' then
    raise exception 'Invalid institutional email' using errcode = '22023';
  end if;
  return exists (
    select 1 from auth.users u
    where pg_catalog.lower(u.email) = normalized_email
  );
end;
$$;
revoke all on function public.is_email_registered(text) from public;
grant execute on function public.is_email_registered(text) to anon, authenticated;
commit;
