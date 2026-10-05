begin;

-- Rol funcional del proyecto, independiente del rol técnico de Supabase (authenticated).
create or replace function private.default_user_role(p_email text)
returns text language sql immutable set search_path='' as $$
 select case pg_catalog.split_part(pg_catalog.lower(pg_catalog.btrim(p_email)), '@', 2)
  when 'sena.edu.co' then 'Instructor'
  when 'soy.sena.edu.co' then 'Aprendiz'
  else 'Visitante'
 end;
$$;
revoke all on function private.default_user_role(text) from public,anon,authenticated;

-- Usuarios locales: se usa app_metadata, que no puede editar el usuario desde el navegador.
create or replace function private.assign_local_user_role()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.raw_app_meta_data->>'rol','')='' then
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data,'{}'::jsonb)
    || jsonb_build_object('rol',private.default_user_role(new.email));
 end if;
 return new;
end;
$$;
revoke all on function private.assign_local_user_role() from public,anon,authenticated;
drop trigger if exists assign_default_project_role on auth.users;
create trigger assign_default_project_role before insert on auth.users
for each row execute function private.assign_local_user_role();

-- Usuarios Google/Auth0: solo se calcula al insertar, nunca en los siguientes logins.
alter table public.auth0_profiles add column if not exists rol text;
create or replace function private.assign_auth0_user_role()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.rol is null or btrim(new.rol)='' then
  new.rol := private.default_user_role(coalesce(new.email,new.recovery_email));
 end if;
 return new;
end;
$$;
revoke all on function private.assign_auth0_user_role() from public,anon,authenticated;
drop trigger if exists assign_default_project_role on public.auth0_profiles;
create trigger assign_default_project_role before insert on public.auth0_profiles
for each row execute function private.assign_auth0_user_role();

-- Completar usuarios existentes que todavía no tienen rol.
update auth.users
set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
 || jsonb_build_object('rol',private.default_user_role(email))
where coalesce(raw_app_meta_data->>'rol','')='';
update public.auth0_profiles
set rol=private.default_user_role(coalesce(email,recovery_email))
where rol is null or btrim(rol)='';
alter table public.auth0_profiles alter column rol set not null;

commit;
