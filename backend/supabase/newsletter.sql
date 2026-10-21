-- Run once in Supabase SQL Editor. Existing profiles/study_state are not modified.
begin;
create table if not exists public.intmed_newsletter_deliveries (
  campaign_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  body_hash text not null,
  status text not null check (status in ('processing','sent','error','uncertain')),
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id,user_id)
);
alter table public.intmed_newsletter_deliveries enable row level security;
revoke all on public.intmed_newsletter_deliveries from public, anon, authenticated;
grant select,insert,update,delete on public.intmed_newsletter_deliveries to service_role;
commit;
