begin;
create table if not exists public.auth0_profiles (
 id uuid primary key default gen_random_uuid(),
 issuer text not null,
 auth0_subject text not null,
 email text not null,
 email_verified boolean not null default true,
 nombres text not null default '',
 apellidos text not null default '',
 nombre_completo text not null default '',
 picture_url text,
 created_at timestamptz not null default now(),
 last_login_at timestamptz not null default now(),
 unique(issuer,auth0_subject)
);
alter table public.auth0_profiles enable row level security;
revoke all on public.auth0_profiles from public,anon,authenticated;
grant select,insert,update on public.auth0_profiles to service_role;
commit;
