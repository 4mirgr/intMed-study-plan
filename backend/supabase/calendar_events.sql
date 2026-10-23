-- Private idempotency ledger for study-plan reminder emails.
create table if not exists public.intmed_calendar_deliveries(
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  event_hash text not null,
  status text not null default 'processing' check(status in ('processing','sent','error','uncertain')),
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,plan_id,event_hash)
);
alter table public.intmed_calendar_deliveries enable row level security;
revoke all on public.intmed_calendar_deliveries from public,anon,authenticated;
grant all on public.intmed_calendar_deliveries to service_role;

