begin;
alter table public.auth0_profiles alter column email drop not null;
alter table public.auth0_profiles add column if not exists recovery_email text;
alter table public.auth0_profiles add column if not exists recovery_email_verified boolean not null default false;
-- Clasifica también los perfiles Google que ya existen.
update public.auth0_profiles
set recovery_email=lower(btrim(email)), recovery_email_verified=email_verified,
    email=null, email_verified=false
where email is not null and lower(btrim(email)) !~ '^[^[:space:]@]+@(soy\.)?sena\.edu\.co$';
alter table public.auth0_profiles drop constraint if exists auth0_profiles_institutional_email;
alter table public.auth0_profiles add constraint auth0_profiles_institutional_email
check (email is null or email ~ '^[^[:space:]@]+@(soy\.)?sena\.edu\.co$');
commit;
