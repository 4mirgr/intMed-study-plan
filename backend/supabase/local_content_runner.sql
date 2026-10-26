-- Secure bridge between the private Telegram inbox and an owner-operated LM Studio runner.
-- Apply after telegram_ingest.sql. Browser clients never receive table/RPC privileges.
begin;

create table if not exists public.intmed_content_local_jobs(
  ingest_id uuid primary key references public.intmed_content_ingest(id) on delete cascade,
  lease_id uuid not null unique,
  claimed_by uuid not null references public.profiles(id) on delete restrict,
  runner_id text not null check(runner_id ~ '^[A-Za-z0-9._-]{1,80}$'),
  state text not null check(state in ('active','submitted','failed','expired')),
  lease_until timestamptz not null,
  last_heartbeat_at timestamptz not null default now(),
  model text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intmed_content_local_jobs_claimed_idx
on public.intmed_content_local_jobs(claimed_by,state,lease_until desc);

-- Reclaim expired local work before taking the project-wide content lease. This prevents a
-- sleeping laptop from leaving an inbox item permanently in `processing`.
create or replace function public.claim_intmed_local_content(
  claimant uuid, new_lease uuid, local_runner_id text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare claimed uuid;
begin
  if claimant is null or new_lease is null or local_runner_id !~ '^[A-Za-z0-9._-]{1,80}$' then
    raise exception 'invalid local runner claim';
  end if;
  if not exists(select 1 from public.profiles where id=claimant and role='admin' and approved and not rejected) then
    raise exception 'admin required';
  end if;

  -- Retry transient LM Studio failures only after a cooling period; paid-provider states are
  -- intentionally untouched. This avoids a fast failure/reclaim loop on an 8 GB laptop.
  update public.intmed_content_drafts d set status='queued',updated_at=now()
  where d.status='waiting_provider' and d.provider='lmstudio'
    and d.error_code like 'local_%' and d.updated_at<=now()-interval '15 minutes';

  with expired as (
    update public.intmed_content_local_jobs
    set state='expired',error_code='local_lease_expired',updated_at=now()
    where state='active' and lease_until<=now()
    returning ingest_id,lease_id
  ), reset_ingest as (
    update public.intmed_content_ingest i set status='pending_review',error_code='local_lease_expired',updated_at=now()
    from expired e where i.id=e.ingest_id and i.status='processing'
    returning i.id
  ), reset_draft as (
    update public.intmed_content_drafts d set status='queued',error_code='local_lease_expired',updated_at=now()
    from expired e where d.ingest_id=e.ingest_id and d.status='processing'
    returning d.ingest_id
  )
  update public.intmed_content_worker_lease w set owner=null,lease_until=now(),updated_at=now()
  from expired e where w.lease_key='worker' and w.owner=e.lease_id;

  claimed:=public.claim_intmed_content_ingest(null,new_lease);
  if claimed is null then return null; end if;
  insert into public.intmed_content_local_jobs(
    ingest_id,lease_id,claimed_by,runner_id,state,lease_until,last_heartbeat_at,error_code,updated_at
  ) values(
    claimed,new_lease,claimant,local_runner_id,'active',now()+interval '5 minutes',now(),null,now()
  ) on conflict(ingest_id) do update set
    lease_id=excluded.lease_id,claimed_by=excluded.claimed_by,runner_id=excluded.runner_id,
    state='active',lease_until=excluded.lease_until,last_heartbeat_at=now(),model=null,
    error_code=null,updated_at=now();
  return claimed;
end $$;

create or replace function public.heartbeat_intmed_local_content(
  target_ingest uuid, lease_owner uuid, claimant uuid
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare touched integer;
begin
  update public.intmed_content_local_jobs set
    lease_until=now()+interval '5 minutes',last_heartbeat_at=now(),updated_at=now()
  where ingest_id=target_ingest and lease_id=lease_owner and claimed_by=claimant
    and state='active' and lease_until>now();
  get diagnostics touched=row_count;
  if touched=0 then return false; end if;
  update public.intmed_content_worker_lease set lease_until=now()+interval '10 minutes',updated_at=now()
  where lease_key='worker' and owner=lease_owner;
  return found;
end $$;

create or replace function public.complete_intmed_local_content(
  target_ingest uuid, lease_owner uuid, claimant uuid, result_draft jsonb,
  extracted_source text, model_name text, prompt_name text
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare touched integer; target_topic text; confidence numeric;
begin
  perform 1 from public.intmed_content_local_jobs
  where ingest_id=target_ingest and lease_id=lease_owner and claimed_by=claimant
    and state='active' and lease_until>now() for update;
  if not found then return false; end if;
  if result_draft is null or jsonb_typeof(result_draft)<>'object' then raise exception 'invalid draft'; end if;
  target_topic:=nullif(result_draft->>'suggestedTopicId','');
  confidence:=coalesce((result_draft->>'confidence')::numeric,0);
  if target_topic is not null and target_topic !~ '^[a-z0-9][a-z0-9-]{1,79}$' then raise exception 'invalid topic'; end if;
  if confidence<0 or confidence>1 then raise exception 'invalid confidence'; end if;

  insert into public.intmed_content_drafts(
    ingest_id,status,topic_id,topic_confidence,title,source_summary,extracted_text,draft_json,
    provider,model,prompt_version,error_code,attempts,updated_at
  ) values(
    target_ingest,'draft_ready',target_topic,confidence,left(result_draft->>'title',240),
    left(result_draft->>'sourceSummary',4000),left(extracted_source,500000),result_draft,
    'lmstudio',left(model_name,160),left(prompt_name,80),null,1,now()
  ) on conflict(ingest_id) do update set
    status='draft_ready',topic_id=excluded.topic_id,topic_confidence=excluded.topic_confidence,
    title=excluded.title,source_summary=excluded.source_summary,extracted_text=excluded.extracted_text,
    draft_json=excluded.draft_json,provider='lmstudio',model=excluded.model,
    prompt_version=excluded.prompt_version,error_code=null,updated_at=now();
  update public.intmed_content_ingest set status='pending_review',error_code=null,updated_at=now()
  where id=target_ingest;
  update public.intmed_content_local_jobs set state='submitted',model=left(model_name,160),
    lease_until=now(),updated_at=now() where ingest_id=target_ingest and lease_id=lease_owner;
  get diagnostics touched=row_count;
  perform public.release_intmed_content_lease(lease_owner);
  return touched=1;
end $$;

create or replace function public.fail_intmed_local_content(
  target_ingest uuid, lease_owner uuid, claimant uuid, failure_code text, model_name text
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare touched integer; code text:=left(coalesce(nullif(failure_code,''),'local_runner_failed'),80);
begin
  update public.intmed_content_local_jobs set state='failed',model=left(model_name,160),
    error_code=code,lease_until=now(),updated_at=now()
  where ingest_id=target_ingest and lease_id=lease_owner and claimed_by=claimant
    and state='active' and lease_until>now();
  get diagnostics touched=row_count;
  if touched=0 then return false; end if;
  update public.intmed_content_drafts set status='waiting_provider',error_code=code,
    provider='lmstudio',model=left(model_name,160),updated_at=now() where ingest_id=target_ingest;
  update public.intmed_content_ingest set status='pending_review',error_code=code,updated_at=now()
  where id=target_ingest;
  perform public.release_intmed_content_lease(lease_owner);
  return true;
end $$;

alter table public.intmed_content_local_jobs enable row level security;
revoke all on public.intmed_content_local_jobs from public,anon,authenticated;
grant all on public.intmed_content_local_jobs to service_role;
revoke all on function public.claim_intmed_local_content(uuid,uuid,text),
 public.heartbeat_intmed_local_content(uuid,uuid,uuid),
 public.complete_intmed_local_content(uuid,uuid,uuid,jsonb,text,text,text),
 public.fail_intmed_local_content(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_intmed_local_content(uuid,uuid,text),
 public.heartbeat_intmed_local_content(uuid,uuid,uuid),
 public.complete_intmed_local_content(uuid,uuid,uuid,jsonb,text,text,text),
 public.fail_intmed_local_content(uuid,uuid,uuid,text,text) to service_role;

commit;
