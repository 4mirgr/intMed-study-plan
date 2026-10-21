-- Explicit requested cleanup, SQL Editor only. Review the SELECT results before running.
-- Shared Auth identities are NEVER deleted. Removes only IntMed membership and its study data.
-- Users of other applications in this Supabase project are not touched.
select id,username,role from public.profiles
where role <> 'admin' and lower(username) <> 'test' order by username;
begin;
do $$
declare owner_id uuid; admins integer; tests integer;
begin
 select count(*),min(id::text)::uuid into admins,owner_id from public.profiles where role='admin' and approved and not rejected;
 select count(*) into tests from public.profiles where lower(username)='test';
 if admins<>1 or tests<>1 then raise exception 'Expected one active admin and exactly one test membership. Nothing deleted.'; end if;
 if not exists(select 1 from auth.users where id=owner_id and email_confirmed_at is not null) then raise exception 'Owner email must be verified.'; end if;
 -- An unexpected second admin is protected; stop instead of silently keeping/deleting it.
 if exists(select 1 from public.profiles where role='admin' and id<>owner_id) then raise exception 'Extra admin requires review.'; end if;
 delete from public.tickets where user_id in(select id from public.profiles where id<>owner_id and lower(username)<>'test');
 delete from public.study_state where user_id in(select id from public.profiles where id<>owner_id and lower(username)<>'test');
 delete from public.profiles where id<>owner_id and lower(username)<>'test';
 update public.profiles set username='drgerami',updated_at=now() where id=owner_id;
end; $$;
commit;
