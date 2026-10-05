begin;
alter table private.email_verifications add column if not exists registration_claimed_at timestamptz;
alter table private.email_verifications add column if not exists registered_user_id uuid;
create or replace function public.claim_verified_registration(p_email text, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v private.email_verifications%rowtype;
begin
 select * into v from private.email_verifications where email=p_email and challenge_id=p_id for update;
 if not found or not v.sent or v.verified_at is null then return 'unverified'; end if;
 if v.registered_user_id is not null then return 'completed'; end if;
 if v.verified_at < now()-interval '15 minutes' then return 'expired'; end if;
 if exists(select 1 from auth.users where lower(email)=p_email) then return 'registered'; end if;
 if v.registration_claimed_at is not null then return 'pending'; end if;
 update private.email_verifications set registration_claimed_at=now() where email=p_email;
 return 'ready';
end $$;
create or replace function public.finish_verified_registration(p_email text, p_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if p_user_id is not null and not exists(select 1 from auth.users where id=p_user_id and lower(email)=p_email) then return false; end if;
 update private.email_verifications set registered_user_id=p_user_id, registration_claimed_at=case when p_user_id is null then null else registration_claimed_at end
 where email=p_email and challenge_id=p_id and registration_claimed_at is not null and registered_user_id is null;
 return found;
end $$;
revoke all on function public.claim_verified_registration(text,uuid) from public,anon,authenticated;
revoke all on function public.finish_verified_registration(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_verified_registration(text,uuid) to service_role;
grant execute on function public.finish_verified_registration(text,uuid,uuid) to service_role;
commit;
