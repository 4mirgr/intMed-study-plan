-- SQL Editor only. Keeps the SAME UUID, password and verified Auth email.
-- If several active admins exist, stop rather than rename the wrong person.
begin;
do $$
declare owner_id uuid; owner_email text; admins integer;
begin
  select count(*),min(id::text)::uuid into admins,owner_id
  from public.profiles where role='admin' and approved and not rejected;
  if admins <> 1 then raise exception 'Expected exactly one active admin; no account was changed.'; end if;
  select email into owner_email from auth.users where id=owner_id and email_confirmed_at is not null;
  if owner_email is null then raise exception 'Admin Auth email must be verified; nothing changed.'; end if;
  update public.profiles set username='drgerami',email=owner_email,updated_at=now() where id=owner_id;
end; $$;
commit;
