-- IntMed least-privilege update. No user/state content is deleted or rewritten.
begin;
create or replace function public.is_intmed_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and approved and not rejected); $$;
revoke all on function public.is_intmed_admin() from public,anon;
grant execute on function public.is_intmed_admin() to authenticated;
-- Managers retain read access for analytics/PDF. Only an approved owner may write
-- browser study state. Checked server functions retain their explicit duties.
drop policy if exists "state self insert" on public.study_state;
create policy "state self insert" on public.study_state for insert to authenticated
with check(user_id=auth.uid() and public.is_intmed_approved());
drop policy if exists "state self or admin update" on public.study_state;
create policy "state self or admin update" on public.study_state for update to authenticated
using(user_id=auth.uid() and public.is_intmed_approved())
with check(user_id=auth.uid() and public.is_intmed_approved());
commit;
