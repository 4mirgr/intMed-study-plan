-- Additive upgrade. No users, UUIDs, highlights or study rows are replaced.
begin;
-- The Auth email is authoritative. Profile/contact edits cannot change it.
revoke update(email) on public.profiles from authenticated;
update public.profiles p set email=u.email from auth.users u
where p.id=u.id and u.email_confirmed_at is not null and p.email is distinct from u.email;
create or replace function public.sync_intmed_auth_email()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  if new.email is distinct from old.email then
    update public.profiles set email=new.email,updated_at=now() where id=new.id;
  end if;
  return new;
end; $$;
drop trigger if exists on_intmed_email_updated on auth.users;
create trigger on_intmed_email_updated after update of email on auth.users
for each row execute function public.sync_intmed_auth_email();

create or replace function public.update_intmed_username(new_username text)
returns void language plpgsql security definer set search_path=public
as $$
declare normalized text:=lower(trim(new_username));
begin
  if not public.is_intmed_approved() then raise exception 'approved account required' using errcode='42501'; end if;
  if normalized is null or normalized !~ '^[a-z0-9_.-]{3,64}$' then raise exception 'Invalid username'; end if;
  update public.profiles set username=normalized,updated_at=now() where id=auth.uid();
end; $$;
revoke all on function public.update_intmed_username(text) from public,anon;
grant execute on function public.update_intmed_username(text) to authenticated;

create or replace function public.set_intmed_user_approval(target_user uuid,new_approved boolean)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.is_intmed_admin() or not public.is_intmed_approved() then raise exception 'admin required' using errcode='42501'; end if;
  if new_approved is null then raise exception 'Approval value required'; end if;
  if target_user=auth.uid() or exists(select 1 from public.profiles where id=target_user and role='admin') then
    raise exception 'Administrator access cannot be suspended here' using errcode='42501';
  end if;
  update public.profiles set approved=new_approved,rejected=not new_approved,updated_at=now() where id=target_user;
end; $$;
revoke all on function public.set_intmed_user_approval(uuid,boolean) from public,anon;
grant execute on function public.set_intmed_user_approval(uuid,boolean) to authenticated;
commit;
