-- Owner-only setup in Supabase SQL Editor. No password/key is needed here.
-- Replace YOUR_EMAIL_HERE with YOUR verified Auth email. Review before running.
-- Only that identity is changed; no other user's profile or study notes are touched.
begin;
do $$
declare
  owner_email text := 'YOUR_EMAIL_HERE';
  owner_id uuid;
begin
  if owner_email='YOUR_EMAIL_HERE' then
    raise exception 'Replace YOUR_EMAIL_HERE with your own verified email first';
  end if;
  select id into owner_id from auth.users
    where lower(email)=lower(owner_email) and email_confirmed_at is not null;
  if owner_id is null then
    raise exception 'Verified Auth account not found. Register/verify your own account first.';
  end if;
  insert into public.profiles(id,username,email,full_name)
    values(owner_id,'intmed-admin-'||replace(owner_id::text,'-',''),owner_email,'مدیر IntMed')
    on conflict(id) do nothing;
  update public.profiles set role='admin',approved=true,rejected=false,updated_at=now()
    where id=owner_id;
end $$;
commit;
