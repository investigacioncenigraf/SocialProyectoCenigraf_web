begin;
create table if not exists private.password_recovery_requests (
 email text primary key,
 last_sent_at timestamptz not null default now(),
 window_started timestamptz not null default now(),
 sends integer not null default 1
);
alter table private.password_recovery_requests enable row level security;
revoke all on private.password_recovery_requests from public, anon, authenticated;
create or replace function public.prepare_password_recovery(p_email text)
returns text language plpgsql security definer set search_path='' as $$
declare previous private.password_recovery_requests%rowtype;
begin
 if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@(soy\.)?sena\.edu\.co$' then return 'invalid_email'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recovery:' || p_email,0));
 select * into previous from private.password_recovery_requests where email=p_email for update;
 if found and previous.last_sent_at > now()-interval '60 seconds' then return 'cooldown'; end if;
 if previous.window_started > now()-interval '1 hour' and previous.sends>=5 then return 'rate_limit'; end if;
 insert into private.password_recovery_requests(email) values(p_email)
 on conflict(email) do update set last_sent_at=now(),
 window_started=case when previous.window_started>now()-interval '1 hour' then previous.window_started else now() end,
 sends=case when previous.window_started>now()-interval '1 hour' then previous.sends+1 else 1 end;
 if not exists(select 1 from auth.users where lower(email)=p_email and email_confirmed_at is not null) then return 'not_registered'; end if;
 return 'ready';
end $$;
revoke all on function public.prepare_password_recovery(text) from public,anon,authenticated;
grant execute on function public.prepare_password_recovery(text) to service_role;
commit;
