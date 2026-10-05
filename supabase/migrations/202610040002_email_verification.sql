begin;
create schema if not exists private;
create table if not exists private.email_verifications (
 email text primary key, challenge_id uuid not null unique, code_hash text not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 attempts integer not null default 0, sent boolean not null default false,
 verified_at timestamptz, window_started timestamptz not null default now(), sends integer not null default 1
);
alter table private.email_verifications enable row level security;
revoke all on private.email_verifications from public, anon, authenticated;
create or replace function public.prepare_email_verification(p_email text, p_id uuid, p_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare previous private.email_verifications%rowtype;
begin
 if p_email !~ '^[^[:space:]@]+@(soy\.)?sena\.edu\.co$' then return 'invalid_email'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email, 0));
 if exists(select 1 from auth.users where lower(email)=p_email) then return 'registered'; end if;
 select * into previous from private.email_verifications where email=p_email for update;
 if found and previous.created_at > now()-interval '60 seconds' then return 'cooldown'; end if;
 if previous.window_started > now()-interval '1 hour' and previous.sends >= 5 then return 'rate_limit'; end if;
 insert into private.email_verifications(email,challenge_id,code_hash,expires_at)
 values(p_email,p_id,p_hash,now()+interval '10 minutes')
 on conflict(email) do update set challenge_id=p_id,code_hash=p_hash,created_at=now(),expires_at=now()+interval '10 minutes',
 attempts=0,sent=false,verified_at=null,
 window_started=case when previous.window_started > now()-interval '1 hour' then previous.window_started else now() end,
 sends=case when previous.window_started > now()-interval '1 hour' then previous.sends+1 else 1 end;
 return 'ready';
end $$;
create or replace function public.activate_email_verification(p_id uuid)
returns boolean language sql security definer set search_path = '' as $$
 update private.email_verifications set sent=true where challenge_id=p_id returning true;
$$;
create or replace function public.verify_email_code(p_email text,p_id uuid,p_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare item private.email_verifications%rowtype;
begin
 select * into item from private.email_verifications where email=p_email and challenge_id=p_id for update;
 if not found or not item.sent then return 'invalid'; end if;
 if item.verified_at is not null then return 'used'; end if;
 if item.expires_at <= now() then return 'expired'; end if;
 if item.attempts >= 5 then return 'locked'; end if;
 update private.email_verifications set attempts=attempts+1 where email=p_email;
 if item.code_hash <> p_hash then return 'invalid'; end if;
 if exists(select 1 from auth.users where lower(email)=p_email) then return 'registered'; end if;
 update private.email_verifications set verified_at=now(),code_hash='' where email=p_email;
 return 'verified';
end $$;
revoke all on function public.prepare_email_verification(text,uuid,text) from public,anon,authenticated;
revoke all on function public.activate_email_verification(uuid) from public,anon,authenticated;
revoke all on function public.verify_email_code(text,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_email_verification(text,uuid,text) to service_role;
grant execute on function public.activate_email_verification(uuid) to service_role;
grant execute on function public.verify_email_code(text,uuid,text) to service_role;
commit;
