-- Durable, service-only content work. Browser users never receive runner capabilities.
begin;
create table if not exists public.intmed_content_jobs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.intmed_content_drafts(id) on delete cascade,
  ingest_id uuid not null references public.intmed_content_ingest(id) on delete cascade,
  kind text not null check (kind in ('extract','generate')),
  outputs jsonb not null default '[]'::jsonb check(jsonb_typeof(outputs)='array'),
  status text not null default 'queued' check(status in ('queued','running','completed','error')),
  expected_revision integer not null default 0 check(expected_revision >= 0),
  progress jsonb not null default '{}'::jsonb check(jsonb_typeof(progress)='object'),
  error text,
  capability_hash text not null check(capability_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists intmed_content_jobs_active_extract
  on public.intmed_content_jobs(ingest_id) where kind='extract' and status in ('queued','running');
create unique index if not exists intmed_content_jobs_active_generate
  on public.intmed_content_jobs(draft_id) where kind='generate' and status in ('queued','running');
create unique index if not exists intmed_content_jobs_active_ingest
  on public.intmed_content_jobs(ingest_id) where status in ('queued','running');
create index if not exists intmed_content_jobs_draft_idx on public.intmed_content_jobs(draft_id,created_at desc);
create index if not exists intmed_content_jobs_ingest_idx on public.intmed_content_jobs(ingest_id,created_at desc);
alter table public.intmed_content_jobs enable row level security;
revoke all on public.intmed_content_jobs from public,anon,authenticated;
grant all on public.intmed_content_jobs to service_role;
commit;
