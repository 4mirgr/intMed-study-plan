-- Private Telegram content inbox. Apply after schema.sql and telegram_notifications.sql.
-- Text and files are quarantined for explicit review; no trigger publishes educational content.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'intmed-content-inbox',
  'intmed-content-inbox',
  false,
  20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.intmed_content_ingest(
  id uuid primary key default gen_random_uuid(),
  telegram_update_id bigint not null unique,
  telegram_chat_id text not null,
  telegram_message_id bigint not null,
  telegram_file_id text,
  telegram_file_unique_id text,
  kind text not null,
  original_filename text,
  mime_type text not null,
  byte_size integer not null,
  storage_path text unique,
  sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  caption text,
  content_text text,
  is_forwarded boolean not null default false,
  source_type text,
  source_name text,
  source_username text,
  source_message_id bigint,
  source_date timestamptz,
  suggested_topic_id text check(suggested_topic_id is null or suggested_topic_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  status text not null default 'quarantined' check(status in ('quarantined','pending_review','processing','accepted','rejected','error')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the draft migration repeatable if an earlier file-only version was applied.
alter table public.intmed_content_ingest alter column telegram_file_id drop not null;
alter table public.intmed_content_ingest alter column storage_path drop not null;
alter table public.intmed_content_ingest add column if not exists content_text text;
alter table public.intmed_content_ingest add column if not exists is_forwarded boolean not null default false;
alter table public.intmed_content_ingest add column if not exists source_type text;
alter table public.intmed_content_ingest add column if not exists source_name text;
alter table public.intmed_content_ingest add column if not exists source_username text;
alter table public.intmed_content_ingest add column if not exists source_message_id bigint;
alter table public.intmed_content_ingest add column if not exists source_date timestamptz;
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_kind_check;
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_mime_type_check;
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_byte_size_check;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='intmed_content_ingest_payload_check' and conrelid='public.intmed_content_ingest'::regclass) then
  alter table public.intmed_content_ingest add constraint intmed_content_ingest_payload_check check(
   (kind='text' and mime_type='text/plain' and telegram_file_id is null and storage_path is null and content_text is not null and char_length(content_text) between 1 and 12000 and byte_size between 1 and 65536)
   or
   (kind in ('pdf','image') and mime_type in ('application/pdf','image/jpeg','image/png','image/webp') and telegram_file_id is not null and storage_path is not null and content_text is null and byte_size between 1 and 20971520)
  );
 end if;
 if not exists(select 1 from pg_constraint where conname='intmed_content_ingest_source_check' and conrelid='public.intmed_content_ingest'::regclass) then
  alter table public.intmed_content_ingest add constraint intmed_content_ingest_source_check check(
   (not is_forwarded and source_type is null and source_name is null and source_username is null and source_message_id is null and source_date is null)
   or
   (is_forwarded and source_type in ('user','hidden_user','chat','channel') and char_length(coalesce(source_name,''))<=300 and (source_username is null or source_username ~ '^[A-Za-z0-9_]{1,64}$'))
  );
 end if;
end $$;

create index if not exists intmed_content_ingest_status_created_idx
on public.intmed_content_ingest(status,created_at desc);
create index if not exists intmed_content_ingest_sha_idx
on public.intmed_content_ingest(sha256) where sha256 is not null;

-- The hint table is installed by telegram_notifications.sql before this inbox exists.
-- Add the referential link here once both sides are available.
do $$ begin
 if to_regclass('public.intmed_bot_topic_hints') is not null and not exists(
   select 1 from pg_constraint where conname='intmed_bot_topic_hints_ingest_fk'
 ) then
  alter table public.intmed_bot_topic_hints
   add constraint intmed_bot_topic_hints_ingest_fk foreign key(ingest_id)
   references public.intmed_content_ingest(id) on delete cascade;
 end if;
end $$;

-- A Persian routing hint is deliberately stored separately from canonical topic IDs. The
-- content worker may use it as a suggestion, but must still match against the published taxonomy.
create table if not exists public.intmed_bot_topic_hints(
  ingest_id uuid primary key references public.intmed_content_ingest(id) on delete cascade,
  hint_text text not null check(char_length(hint_text) between 1 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.intmed_content_drafts(
  id uuid primary key default gen_random_uuid(),
  ingest_id uuid not null unique references public.intmed_content_ingest(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','waiting_provider','processing','draft_ready','error','rejected')),
  topic_id text check(topic_id is null or topic_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  topic_confidence numeric(4,3) check(topic_confidence is null or topic_confidence between 0 and 1),
  title text,
  source_summary text,
  extracted_text text,
  draft_json jsonb,
  provider text,
  model text,
  prompt_version text not null default 'intmed-content-v1',
  error_code text,
  attempts integer not null default 0 check(attempts between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intmed_content_drafts_status_created_idx
on public.intmed_content_drafts(status,created_at);

-- One project-wide lease serializes expensive provider calls. Telegram can deliver many
-- updates in parallel; without this lease every update used to start its own OpenAI request.
create table if not exists public.intmed_content_worker_lease(
  lease_key text primary key check(lease_key='worker'),
  owner uuid,
  lease_until timestamptz not null default '-infinity'::timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.intmed_content_worker_lease(lease_key) values('worker') on conflict do nothing;

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

create or replace function public.release_intmed_content_lease(lease_owner uuid)
returns void language sql security definer set search_path=public
as $$
  update public.intmed_content_worker_lease set owner=null,lease_until=now(),updated_at=now()
  where lease_key='worker' and owner=lease_owner;
$$;

-- Normalize the legacy ambiguous error produced by the first worker version. These inputs are
-- retained for a controlled retry and no longer inflate the permanent-error counter.
update public.intmed_content_drafts
set status='waiting_provider',error_code='provider_rate_limited',updated_at=now()
where status='error' and error_code='provider_429';
update public.intmed_content_ingest i
set status='pending_review',error_code='provider_rate_limited',updated_at=now()
from public.intmed_content_drafts d
where d.ingest_id=i.id and d.status='waiting_provider' and d.error_code='provider_rate_limited'
  and i.status='error';

alter table public.intmed_content_ingest enable row level security;
alter table public.intmed_content_drafts enable row level security;
alter table public.intmed_bot_topic_hints enable row level security;
alter table public.intmed_content_worker_lease enable row level security;
revoke all on public.intmed_content_ingest from public,anon,authenticated;
revoke all on public.intmed_content_drafts from public,anon,authenticated;
revoke all on public.intmed_bot_topic_hints from public,anon,authenticated;
revoke all on public.intmed_content_worker_lease from public,anon,authenticated;
grant all on public.intmed_content_ingest to service_role;
grant all on public.intmed_content_drafts to service_role;
grant all on public.intmed_bot_topic_hints to service_role;
grant all on public.intmed_content_worker_lease to service_role;
revoke all on function public.claim_intmed_content_ingest(uuid,uuid),public.release_intmed_content_lease(uuid) from public,anon,authenticated;
grant execute on function public.claim_intmed_content_ingest(uuid,uuid),public.release_intmed_content_lease(uuid) to service_role;

commit;
