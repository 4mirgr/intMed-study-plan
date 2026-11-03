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
create or replace function public.claim_intmed_content_ingest(requested uuid,lease_owner uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare claimed uuid;
begin
  if lease_owner is null then raise exception 'lease owner required'; end if;
  update public.intmed_content_worker_lease
  set owner=lease_owner,lease_until=now()+interval '10 minutes',updated_at=now()
  where lease_key='worker' and (lease_until<=now() or owner=lease_owner);
  if not found then return null; end if;

  select i.id into claimed
  from public.intmed_content_ingest i
  left join public.intmed_content_drafts d on d.ingest_id=i.id
  where (requested is null or i.id=requested)
    and i.status in ('pending_review','error')
    and coalesce(d.attempts,0)<20
    and (
      d.ingest_id is null or d.status='queued'
      or (d.status='waiting_provider' and d.error_code in ('provider_rate_limited','provider_quota','provider_unavailable','provider_not_configured'))
      -- Explicit service/admin retries must also accept the parser handoff state.
      -- Automatic polls cannot reopen a completed or reviewed draft.
      or (requested is not null and d.status in ('processing','error','draft_ready'))
    )
  order by i.created_at,i.id
  for update of i skip locked
  limit 1;

  if claimed is null then
    update public.intmed_content_worker_lease set owner=null,lease_until=now(),updated_at=now()
    where lease_key='worker' and owner=lease_owner;
    return null;
  end if;

  insert into public.intmed_content_drafts(ingest_id,status,attempts,error_code,updated_at)
  values(claimed,'processing',1,null,now())
  on conflict(ingest_id) do update set
    status='processing',attempts=public.intmed_content_drafts.attempts+1,
    error_code=null,updated_at=now();
  update public.intmed_content_ingest set status='processing',error_code=null,updated_at=now()
  where id=claimed;
  return claimed;
end $$;


revoke all on function public.claim_intmed_content_ingest(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_intmed_content_ingest(uuid,uuid) to service_role;
commit;
