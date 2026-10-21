-- Run ONCE in the existing project's SQL Editor. Additive: no users/state deleted.
begin;
alter table public.profiles add column if not exists specialty text;
alter table public.profiles add column if not exists province text;
grant update(specialty,province) on public.profiles to authenticated;

-- Refuse ambiguous usernames instead of renaming existing people's accounts.
do $$ begin
  if exists(select 1 from public.profiles group by lower(username) having count(*)>1) then
    raise exception 'Case-insensitive duplicate usernames exist. Resolve them before this migration.';
  end if;
end $$;
create unique index if not exists intmed_username_lower_unique on public.profiles(lower(username));

-- Preserve existing identities/notes. Recover new form values even if someone signed
-- up between deployment of the form and installation of this migration.
update public.profiles p set
  specialty=coalesce(p.specialty,nullif(u.raw_user_meta_data->>'specialty','')),
  province=coalesce(p.province,nullif(u.raw_user_meta_data->>'province',''))
from auth.users u where u.id=p.id and (p.specialty is null or p.province is null);

create or replace function public.handle_intmed_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  -- Apply the new form contract only to IntMed signups in this shared project.
  if new.raw_user_meta_data->>'app'='intmed' then
    if coalesce(new.raw_user_meta_data->>'username','') !~ '^[a-z0-9_.-]{3,64}$'
      or length(trim(coalesce(new.raw_user_meta_data->>'fullName','')))=0
      or coalesce(new.raw_user_meta_data->>'degree','') not in
        ('دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص') then
      raise exception 'Invalid IntMed signup profile';
    end if;
  end if;
  insert into public.profiles(id,username,email,full_name,degree,id_number,phone,specialty,province)
  values(new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''),split_part(new.email,'@',1)||'-'||left(new.id::text,6)),
    new.email,new.raw_user_meta_data->>'fullName',new.raw_user_meta_data->>'degree',
    new.raw_user_meta_data->>'idNumber',new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'specialty',new.raw_user_meta_data->>'province')
  on conflict(id) do nothing;
  insert into public.study_state(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;

-- Private server-only, atomic budget for the username login Edge Function.
create table if not exists public.intmed_login_attempts(
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.intmed_login_attempts enable row level security;
revoke all on public.intmed_login_attempts from public,anon,authenticated;
create or replace function public.intmed_allow_login(bucket_key text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare hits integer;
begin
  if bucket_key !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from public.intmed_login_attempts where window_start < now()-interval '1 day';
  insert into public.intmed_login_attempts(bucket,window_start,attempts)
  values(bucket_key,now(),1)
  on conflict(bucket) do update set
    attempts=case when intmed_login_attempts.window_start < now()-interval '10 minutes' then 1 else intmed_login_attempts.attempts+1 end,
    window_start=case when intmed_login_attempts.window_start < now()-interval '10 minutes' then now() else intmed_login_attempts.window_start end
  returning attempts into hits;
  return hits <= 30;
end;
$$;
revoke all on function public.intmed_allow_login(text) from public,anon,authenticated;
grant execute on function public.intmed_allow_login(text) to service_role;
commit;
