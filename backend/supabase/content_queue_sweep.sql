-- Recovery is service-only. Install disabled, deploy the Edge Function, then enable.
begin;
create schema if not exists intmed_queue_private;
revoke all on schema intmed_queue_private from public,anon,authenticated;
create table if not exists public.intmed_queue_sweep_state(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  token_hash text check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  run_id uuid,
  expires_at timestamptz,
  claimed_at timestamptz,
  completed_run_id uuid,
  request_id bigint,
  last_requested_at timestamptz,
  last_finished_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_retry_at timestamptz,
  consecutive_waits integer not null default 0 check(consecutive_waits between 0 and 4),
  last_result jsonb not null default '{}'::jsonb,
  last_error text
);
insert into public.intmed_queue_sweep_state(singleton) values(true) on conflict do nothing;
alter table public.intmed_queue_sweep_state add column if not exists provider_retry_at timestamptz;
alter table public.intmed_queue_sweep_state enable row level security;
revoke all on public.intmed_queue_sweep_state from public,anon,authenticated;
grant select,update on public.intmed_queue_sweep_state to service_role;

create or replace function public.claim_intmed_queue_sweep(p_token text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare claimed uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  update public.intmed_queue_sweep_state
  set token_hash=null,claimed_at=now()
  where singleton and enabled and expires_at>now() and claimed_at is null
    and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
  returning run_id into claimed;
  return claimed;
end $$;

create or replace function public.complete_intmed_queue_sweep(p_run_id uuid,p_result jsonb,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare current_wait integer; retry_at timestamptz; cooldown interval; result_reason text; waiting integer; safe_error text;
begin
  if p_run_id is null or p_result is null or jsonb_typeof(p_result)<>'object' then return false; end if;
  select consecutive_waits,provider_retry_at into current_wait,retry_at from public.intmed_queue_sweep_state
  where singleton and enabled and run_id=p_run_id and claimed_at is not null
    and completed_run_id is distinct from p_run_id for update;
  if not found then return false; end if;
  waiting=case when p_result->>'waitingProvider' ~ '^[0-3]$' then (p_result->>'waitingProvider')::integer else 0 end;
  result_reason=case when p_result->>'reason' in ('manual_mode','empty_or_busy') then p_result->>'reason' else null end;
  safe_error=case when p_error ~ '^worker_http_[0-9]{3}$' or p_error='worker_network_failed' then p_error else null end;
  if retry_at>now() then
    -- A chained/event-triggered worker already deferred the shared provider.
    -- Do not clear that delay or increment it again in the scheduler callback.
    cooldown=retry_at-now();
  elsif waiting>0 then
    cooldown=interval '15 minutes'*power(2,least(current_wait,2));
    current_wait=least(4,current_wait+1);
  elsif result_reason='manual_mode' then cooldown=interval '1 hour';
  elsif safe_error is not null then
    cooldown=interval '5 minutes'*power(2,least(current_wait,2));
    current_wait=least(4,current_wait+1);
  else cooldown=interval '5 minutes';current_wait=0;
  end if;
  update public.intmed_queue_sweep_state set last_finished_at=now(),completed_run_id=p_run_id,
    token_hash=null,expires_at=null,next_attempt_at=now()+cooldown,
    consecutive_waits=current_wait,last_error=case when retry_at>now() then coalesce(safe_error,last_error) else safe_error end,
    last_result=jsonb_build_object(
      'processed',case when p_result->>'processed' ~ '^[0-3]$' then (p_result->>'processed')::integer else 0 end,
      'waitingProvider',waiting,
      'failed',case when p_result->>'failed' ~ '^[0-3]$' then (p_result->>'failed')::integer else 0 end,
      'reason',result_reason)
  where singleton and run_id=p_run_id;
  return true;
end $$;

create or replace function public.intmed_content_queue_retry_after()
returns integer language sql stable security invoker set search_path='' as $$
 select coalesce((select least(3600,greatest(0,ceil(extract(epoch from provider_retry_at-now()))::integer))
 from public.intmed_queue_sweep_state where singleton and enabled),0);
$$;

create or replace function public.defer_intmed_content_queue(p_reason text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare waits integer; retry_at timestamptz;
begin
 if p_reason is null or p_reason not in ('provider_rate_limited','provider_quota','provider_unavailable','provider_not_configured','provider_model_unavailable') then return false; end if;
 select consecutive_waits into waits from public.intmed_queue_sweep_state where singleton and enabled for update;
 if not found then return false; end if;
 retry_at=now()+interval '15 minutes'*power(2,least(waits,2));
 update public.intmed_queue_sweep_state set
  provider_retry_at=greatest(coalesce(provider_retry_at,'-infinity'::timestamptz),retry_at),
  next_attempt_at=greatest(next_attempt_at,retry_at),consecutive_waits=least(4,waits+1),
  last_error=p_reason where singleton;
 return true;
end $$;

-- Cron runs as postgres. This SECURITY INVOKER function is not an exposed RPC and
-- only mints a two-minute one-use token, never a service key or permanent secret.
create or replace function intmed_queue_private.request_sweep()
returns bigint language plpgsql security invoker set search_path='' as $$
declare state public.intmed_queue_sweep_state%rowtype; capability text; queued bigint;
begin
  select * into state from public.intmed_queue_sweep_state where singleton for update skip locked;
  if not found or not state.enabled or state.next_attempt_at>now()
    or (state.token_hash is not null and state.expires_at>now()) then return null; end if;

  -- Keep rejected decisions out of the active inbox count; no source is deleted.
  update public.intmed_content_ingest i set status='rejected',updated_at=now()
  from public.intmed_content_drafts d where d.ingest_id=i.id and d.status='rejected'
    and i.status in ('pending_review','error');

  -- Revoke abandoned runner capabilities before letting any new worker reclaim.
  update public.intmed_content_jobs set status='error',error='queue_job_expired',
    expires_at=now(),updated_at=now()
  where status in ('queued','running') and (expires_at<=now() or updated_at<now()-interval '30 minutes');

  if not exists(select 1 from public.intmed_content_worker_lease where lease_key='worker' and lease_until>now()) then
    with recovered as (
      update public.intmed_content_ingest i set status='pending_review',error_code='queue_recovered',updated_at=now()
      from public.intmed_content_drafts d
      where d.ingest_id=i.id and i.status='processing' and i.updated_at<now()-interval '20 minutes'
        and d.status='processing' and d.attempts<20
        and not exists(select 1 from public.intmed_content_jobs j where j.ingest_id=i.id and j.status in ('queued','running'))
      returning i.id
    )
    update public.intmed_content_drafts d set status='queued',error_code='queue_recovered',updated_at=now()
    where d.ingest_id in (select id from recovered)
      -- UPDATE rechecks these predicates after acquiring the draft row lock.
      -- Never overwrite a teacher decision committed after the CTE snapshot.
      and d.status='processing' and d.updated_at<now()-interval '20 minutes';

    -- A parser handoff can lose its routing wake-up without losing extraction.
    update public.intmed_content_drafts d set status='queued',error_code='queue_recovered',updated_at=now()
    from public.intmed_content_ingest i where d.ingest_id=i.id
      and i.status in ('pending_review','error') and d.status='error' and d.attempts<20
      and d.error_code in ('routing_dispatch_failed','routing_http_503','routing_failed','routing_waiting_provider','routing_http_429')
      and d.draft_json->'documentExtraction'->'quality'->>'actualPageCountVerified'='true'
      and not exists(select 1 from public.intmed_content_jobs j where j.ingest_id=i.id and j.status in ('queued','running'));
  else return null;
  end if;

  if not exists(
    select 1 from public.intmed_content_ingest i left join public.intmed_content_drafts d on d.ingest_id=i.id
    where i.status in ('pending_review','error') and coalesce(d.attempts,0)<20
      and (d.ingest_id is null or d.status='queued' or
        (d.status='waiting_provider' and d.error_code in ('provider_rate_limited','provider_quota','provider_unavailable','provider_not_configured')))
  ) then return null; end if;

  capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  update public.intmed_queue_sweep_state set
    run_id=gen_random_uuid(),token_hash=encode(sha256(convert_to(capability,'UTF8')),'hex'),
    expires_at=now()+interval '2 minutes',claimed_at=null,
    last_requested_at=now(),next_attempt_at=now()+interval '5 minutes',last_error=null where singleton;
  select net.http_post(
    url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/intmed-content-sweep',
    body:=jsonb_build_object('token',capability),
    headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=10000
  ) into queued;
  update public.intmed_queue_sweep_state set request_id=queued where singleton;
  return queued;
end $$;

revoke all on function public.claim_intmed_queue_sweep(text),public.complete_intmed_queue_sweep(uuid,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.claim_intmed_queue_sweep(text),public.complete_intmed_queue_sweep(uuid,jsonb,text)
  to service_role;
revoke all on function public.intmed_content_queue_retry_after(),public.defer_intmed_content_queue(text)
  from public,anon,authenticated;
grant execute on function public.intmed_content_queue_retry_after(),public.defer_intmed_content_queue(text)
  to service_role;
revoke all on function intmed_queue_private.request_sweep() from public,anon,authenticated,service_role;
commit;
