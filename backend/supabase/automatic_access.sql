-- Temporarily remove manual manager approval for new IntMed registrations.
-- Email confirmation remains controlled by Supabase Auth and should stay enabled.
create or replace function public.handle_intmed_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.raw_user_meta_data->>'app'='intmed' then
    if coalesce(new.raw_user_meta_data->>'username','') !~ '^[a-z0-9_.-]{3,64}$'
      or length(trim(coalesce(new.raw_user_meta_data->>'fullName','')))=0
      or coalesce(new.raw_user_meta_data->>'degree','') not in
        ('دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص') then
      raise exception 'Invalid IntMed signup profile';
    end if;
  end if;
  insert into public.profiles(id,username,email,full_name,degree,id_number,phone,specialty,province,approved,rejected)
  values(new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''),split_part(new.email,'@',1)||'-'||left(new.id::text,6)),
    new.email,new.raw_user_meta_data->>'fullName',new.raw_user_meta_data->>'degree',
    new.raw_user_meta_data->>'idNumber',new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'specialty',new.raw_user_meta_data->>'province',
    coalesce(new.raw_user_meta_data->>'app'='intmed',false),false)
  on conflict(id) do nothing;
  insert into public.study_state(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;

-- Activate only older IntMed registrations that were never rejected by a manager.
update public.profiles p set approved=true,updated_at=now()
from auth.users u
where u.id=p.id and u.raw_user_meta_data->>'app'='intmed'
  and not p.approved and not p.rejected;

