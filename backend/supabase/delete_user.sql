-- Install once in SQL Editor. Creates a capability; does NOT delete any user now.
-- Removal is scoped to IntMed because this Supabase Auth project hosts other apps.
begin;
create or replace function public.delete_intmed_user(target_user uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare caller public.profiles%rowtype; victim public.profiles%rowtype;
begin
  select * into caller from public.profiles where id=auth.uid() for update;
  if caller.id is null or caller.role <> 'admin' or not caller.approved or caller.rejected then
    raise exception 'admin required' using errcode='42501';
  end if;
  if target_user is null or target_user=caller.id then
    raise exception 'Cannot delete your own account' using errcode='42501';
  end if;
  select * into victim from public.profiles where id=target_user for update;
  if victim.id is null then return; end if;
  if victim.role='admin' then
    raise exception 'Cannot delete an administrator' using errcode='42501';
  end if;
  delete from public.tickets where user_id=target_user;
  delete from public.study_state where user_id=target_user;
  delete from public.profiles where id=target_user;
  -- Never delete auth.users: its identity can belong to another application.
end;
$$;
revoke all on function public.delete_intmed_user(uuid) from public,anon;
grant execute on function public.delete_intmed_user(uuid) to authenticated;

-- A stale admin tab cannot recreate deleted personal data after removal.
drop policy if exists "intmed ticket insert requires profile" on public.tickets;
create policy "intmed ticket insert requires profile" on public.tickets as restrictive
for insert to authenticated with check(exists(select 1 from public.profiles p where p.id=user_id));
drop policy if exists "intmed ticket update requires profile" on public.tickets;
create policy "intmed ticket update requires profile" on public.tickets as restrictive
for update to authenticated using(exists(select 1 from public.profiles p where p.id=user_id))
with check(exists(select 1 from public.profiles p where p.id=user_id));
drop policy if exists "intmed state insert requires profile" on public.study_state;
create policy "intmed state insert requires profile" on public.study_state as restrictive
for insert to authenticated with check(exists(select 1 from public.profiles p where p.id=user_id));
drop policy if exists "intmed state update requires profile" on public.study_state;
create policy "intmed state update requires profile" on public.study_state as restrictive
for update to authenticated using(exists(select 1 from public.profiles p where p.id=user_id))
with check(exists(select 1 from public.profiles p where p.id=user_id));
commit;
