-- Additive recovery support. Anonymous writes only through the rate-limited Edge function.
begin;
create table if not exists public.intmed_recovery_tickets (
 id uuid primary key default gen_random_uuid(), full_name text not null,
 email text not null, message text not null, reply text not null default '',
 resolved boolean not null default false, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.intmed_recovery_tickets enable row level security;
revoke all on public.intmed_recovery_tickets from public,anon,authenticated;
grant select,update on public.intmed_recovery_tickets to authenticated;
grant all on public.intmed_recovery_tickets to service_role;
drop policy if exists "admin recovery tickets" on public.intmed_recovery_tickets;
create policy "admin recovery tickets" on public.intmed_recovery_tickets for all to authenticated
using (public.is_intmed_admin() and public.is_intmed_approved())
with check (public.is_intmed_admin() and public.is_intmed_approved());
commit;
